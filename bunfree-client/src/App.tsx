import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ChatApp from './components/ChatApp';
import FavoritePage from './components/FavoritePage';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<ChatApp />} />
          <Route path="/favorites" element={<FavoritePage />} />
        </Routes>
        <PWAInstallPrompt />
      </div>
    </Router>
  );
}

export default App;
