
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LessonList } from "./pages/LessonList";
import { LessonView } from "./pages/LessonView";

function App() {
  return (
    <div className="app-shell">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LessonList />} />
          <Route path="/lesson/:id" element={<LessonView />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
