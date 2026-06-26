import { NavLink } from 'react-router-dom'

export function Navbar() {
  return (
    <nav className="navbar">
      <div className="nav-inner">
        <NavLink to="/" className="nav-brand">⚽ 2026世界杯预测</NavLink>
        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>🏟️ 赛事</NavLink>
          <NavLink to="/recommend" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>📋 推荐单</NavLink>
          <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>📊 对比</NavLink>
          <NavLink to="/champion" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>👑 冠亚军</NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>⚙️ 设置</NavLink>
          <NavLink to="/versions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>📝 更新日志</NavLink>
        </div>
      </div>
    </nav>
  )
}
