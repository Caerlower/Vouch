"""
Vouch promo escrow — Algorand Python (Puya) Application.

Holds Testnet USDC (ASA) in the app account. Per-seller balances live in boxes.
Operator (Vouch) registers each seller owner, then remits after off-chain checks.
"""

from algopy import (
    Account,
    ARC4Contract,
    Asset,
    Bytes,
    Global,
    Txn,
    UInt64,
    BoxMap,
    arc4,
    gtxn,
    itxn,
)


class VouchEscrow(ARC4Contract):
    def __init__(self) -> None:
        self.operator = Account()
        self.asset_id = UInt64(0)
        self.bootstrapped = UInt64(0)
        # seller_id (utf8) -> microUSDC balance
        self.balances = BoxMap(Bytes, UInt64, key_prefix=b"bal:")
        # seller_id -> registered owner (set by operator only)
        self.owners = BoxMap(Bytes, Account, key_prefix=b"own:")
        # settle_tx_id (utf8) -> 1 once remitted
        self.remitted = BoxMap(Bytes, UInt64, key_prefix=b"rem:")

    @arc4.abimethod(create="require")
    def create(self, asset: Asset) -> None:
        self.operator = Txn.sender
        self.asset_id = asset.id
        self.bootstrapped = UInt64(0)

    @arc4.abimethod
    def bootstrap(self, asset: Asset) -> None:
        """Opt the app account into USDC. Operator only; once."""
        assert Txn.sender == self.operator, "not operator"
        assert self.bootstrapped == UInt64(0), "already bootstrapped"
        assert asset.id == self.asset_id, "wrong asset"
        itxn.AssetTransfer(
            asset_receiver=Global.current_application_address,
            xfer_asset=asset,
            asset_amount=0,
            fee=0,
        ).submit()
        self.bootstrapped = UInt64(1)

    @arc4.abimethod
    def set_operator(self, new_operator: Account) -> None:
        assert Txn.sender == self.operator, "not operator"
        self.operator = new_operator

    @arc4.abimethod
    def register_owner(self, seller_id: Bytes, owner: Account) -> None:
        """
        Operator binds seller_id → owner before any deposit.
        Prevents first-depositor ownership sniping.
        """
        assert Txn.sender == self.operator, "not operator"
        assert seller_id.length > UInt64(0), "empty seller"
        assert seller_id.length <= UInt64(48), "seller id too long"
        _existing, has_owner = self.owners.maybe(seller_id)
        assert not has_owner, "already registered"
        self.owners[seller_id] = owner

    @arc4.abimethod
    def deposit(
        self, seller_id: Bytes, payment: gtxn.AssetTransferTransaction
    ) -> UInt64:
        """
        Credit seller_id from a grouped ASA payment into the app.
        Group: [axfer USDC -> app, app call deposit].
        Owner must already be register_owner'd; anyone may top up.
        """
        assert self.bootstrapped == UInt64(1), "not bootstrapped"
        assert seller_id.length > UInt64(0), "empty seller"
        assert seller_id.length <= UInt64(48), "seller id too long"
        assert payment.asset_receiver == Global.current_application_address, "bad recv"
        assert payment.xfer_asset.id == self.asset_id, "bad asset"
        assert payment.sender == Txn.sender, "axfer sender mismatch"
        assert payment.asset_amount > UInt64(0), "zero deposit"

        _owner, has_owner = self.owners.maybe(seller_id)
        assert has_owner, "owner not registered"

        bal = self.balances.get(seller_id, default=UInt64(0))
        new_bal = bal + payment.asset_amount
        self.balances[seller_id] = new_bal
        return new_bal

    @arc4.abimethod
    def remit(
        self,
        seller_id: Bytes,
        settle_tx_id: Bytes,
        buyer: Account,
        referrer: Account,
        rebate: UInt64,
        commission: UInt64,
        asset: Asset,
    ) -> None:
        """
        Operator remits rebate (buyer) + commission (referrer) from seller balance.
        Idempotent on settle_tx_id.
        """
        assert Txn.sender == self.operator, "not operator"
        assert self.bootstrapped == UInt64(1), "not bootstrapped"
        assert asset.id == self.asset_id, "wrong asset"
        assert settle_tx_id.length > UInt64(0), "empty settle id"
        assert settle_tx_id.length <= UInt64(64), "settle id too long"

        already = self.remitted.get(settle_tx_id, default=UInt64(0))
        assert already == UInt64(0), "already remitted"

        total = rebate + commission
        assert total > UInt64(0), "nothing to remit"

        bal = self.balances.get(seller_id, default=UInt64(0))
        assert bal >= total, "insufficient escrow"

        self.balances[seller_id] = bal - total
        self.remitted[settle_tx_id] = UInt64(1)

        if rebate > UInt64(0):
            itxn.AssetTransfer(
                asset_receiver=buyer,
                xfer_asset=asset,
                asset_amount=rebate,
                fee=0,
            ).submit()
        if commission > UInt64(0):
            itxn.AssetTransfer(
                asset_receiver=referrer,
                xfer_asset=asset,
                asset_amount=commission,
                fee=0,
            ).submit()

    @arc4.abimethod
    def withdraw(
        self, seller_id: Bytes, amount: UInt64, to: Account, asset: Asset
    ) -> UInt64:
        """Owner or operator withdraws unused promo USDC — destination must be owner."""
        assert self.bootstrapped == UInt64(1), "not bootstrapped"
        assert asset.id == self.asset_id, "wrong asset"
        assert amount > UInt64(0), "zero withdraw"

        owner, has_owner = self.owners.maybe(seller_id)
        assert has_owner, "unknown seller"
        assert Txn.sender == owner or Txn.sender == self.operator, "not authorized"
        assert to == owner, "to must be owner"

        bal = self.balances.get(seller_id, default=UInt64(0))
        assert bal >= amount, "insufficient escrow"
        new_bal = bal - amount
        self.balances[seller_id] = new_bal

        itxn.AssetTransfer(
            asset_receiver=to,
            xfer_asset=asset,
            asset_amount=amount,
            fee=0,
        ).submit()
        return new_bal

    @arc4.abimethod(readonly=True)
    def get_balance(self, seller_id: Bytes) -> UInt64:
        return self.balances.get(seller_id, default=UInt64(0))

    @arc4.abimethod(readonly=True)
    def is_remitted(self, settle_tx_id: Bytes) -> UInt64:
        return self.remitted.get(settle_tx_id, default=UInt64(0))

    @arc4.abimethod(readonly=True)
    def get_operator(self) -> arc4.Address:
        return arc4.Address(self.operator)

    @arc4.abimethod(readonly=True)
    def get_asset_id(self) -> UInt64:
        return self.asset_id

    @arc4.abimethod(readonly=True)
    def get_owner(self, seller_id: Bytes) -> arc4.Address:
        owner, has_owner = self.owners.maybe(seller_id)
        assert has_owner, "unknown seller"
        return arc4.Address(owner)
