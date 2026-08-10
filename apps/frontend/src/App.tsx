import { BrowserRouter, Route, Routes } from "react-router-dom";
import Shell from "./components/Shell";
import Landing from "./pages/Landing";
import HowItWorks from "./pages/HowItWorks";
import Refer from "./pages/Refer";
import Register from "./pages/Register";
import Ledger from "./pages/Ledger";
import DemoHub from "./pages/DemoHub";
import LiveDemo from "./pages/LiveDemo";
import Go from "./pages/Go";

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/demo" element={<DemoHub />} />
          <Route path="/demo/:mode" element={<LiveDemo />} />
          <Route path="/refer" element={<Refer />} />
          <Route path="/register" element={<Register />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/go/:code" element={<Go />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
