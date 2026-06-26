import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { Navbar } from './components/Navbar'
import { VersionBanner } from './components/VersionBanner'
import { WelcomePopup, isPopupDismissed, clearPopupDismissed } from './components/WelcomePopup'
import { MatchList } from './pages/MatchList'
import { History } from './pages/History'
import { Champion } from './pages/Champion'
import { Recommend } from './pages/Recommend'
import { Settings } from './pages/Settings'
import { VersionLog } from './pages/VersionLog'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  const [showPopup, setShowPopup] = useState(false)
  const [autoClose, setAutoClose] = useState(true)

  useEffect(() => {
    if (!isPopupDismissed()) {
      const timer = setTimeout(() => {
        setAutoClose(true)
        setShowPopup(true)
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleManualOpen = useCallback(() => {
    clearPopupDismissed()
    setAutoClose(false)
    setShowPopup(true)
  }, [])

  const handleClosePopup = useCallback(() => {
    setShowPopup(false)
  }, [])

  return (
    <BrowserRouter>
      <div className="app">
        <ScrollToTop />
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
        <VersionBanner />
        <WelcomePopup show={showPopup} autoClose={autoClose} onClose={handleClosePopup} />
        {!showPopup && (
          <button onClick={handleManualOpen} className="popup-reopen-fab" title="更多好玩影视直播软件">
            <span className="popup-fab-tip">点我</span>
            <svg className="popup-reopen-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="20" cy="10" r="5.5" stroke="#fff" strokeWidth="2" fill="none"/>
              <path d="M14 18h12l-2 14h-8l-2-14z" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round"/>
              <circle cx="13" cy="35" r="2.5" stroke="#fff" strokeWidth="1.5" fill="none"/>
              <circle cx="27" cy="35" r="2.5" stroke="#fff" strokeWidth="1.5" fill="none"/>
              <line x1="11" y1="22" x2="7" y2="18" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              <line x1="29" y1="22" x2="33" y2="18" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="34" cy="6" r="5" fill="#ff2e63"/>
              <text x="34" y="9" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">+</text>
            </svg>
          </button>
        )}
      </div>
    </BrowserRouter>
  )
}
