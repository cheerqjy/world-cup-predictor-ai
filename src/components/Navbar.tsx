import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

export function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <NavLink to="/" className="nav-brand">⚽ 2026世界杯预测</NavLink>
        <button className="nav-hamburger" onClick={() => setOpen(!open)}>
          <span className={`hamburger-line ${open ? 'open' : ''}`} />
          <span className={`hamburger-line ${open ? 'open' : ''}`} />
          <span className={`hamburger-line ${open ? 'open' : ''}`} />
        </button>
        <div className={`nav-links ${open ? 'nav-links-open' : ''}`}>
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setOpen(false)}>🏟️ 赛事</NavLink>
          <NavLink to="/recommend" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setOpen(false)}>📋 推荐单</NavLink>
          <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setOpen(false)}>📊 对比</NavLink>
          <NavLink to="/champion" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setOpen(false)}>👑 冠亚军</NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setOpen(false)}>⚙️ 设置</NavLink>
          <NavLink to="/versions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setOpen(false)}>📝 更新日志</NavLink>
          <a
            href="https://10000yun.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-link nav-link-tooltip"
            data-tip="免费影视APP下载_手机追剧软件推荐_2026最新影视资源分享平台"
            onClick={() => setOpen(false)}
          >
            🎬 更多好玩影视直播软件
          </a>
        </div>
        {open && <div className="nav-overlay" onClick={() => setOpen(false)} />}
      </div>
    </nav>
  )
}
