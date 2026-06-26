import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { MatchList } from './pages/MatchList'
import { History } from './pages/History'
import { Champion } from './pages/Champion'
import { Recommend } from './pages/Recommend'
import { Settings } from './pages/Settings'
import { VersionLog } from './pages/VersionLog'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navbar />
        <main className="main">
          <Routes>
            <Route path="/" element={<MatchList />} />
            <Route path="/history" element={<History />} />
            <Route path="/champion" element={<Champion />} />
            <Route path="/recommend" element={<Recommend />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/versions" element={<VersionLog />} />
          </Routes>
        </main>
        <footer className="footer">
          <p>2026世界杯预测系统 · 数据自动更新 · 仅供参考</p>
        </footer>
      </div>
    </BrowserRouter>
  )
}
