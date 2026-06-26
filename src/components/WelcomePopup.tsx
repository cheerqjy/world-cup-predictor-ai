import { useState, useEffect, useCallback } from 'react'

const POPUP_KEY = 'wanyun_popup_dismissed'

interface Props {
  show: boolean
  autoClose: boolean
  onClose: () => void
}

export function WelcomePopup({ show, autoClose, onClose }: Props) {
  const [countdown, setCountdown] = useState(5)
  const [isVisible, setIsVisible] = useState(false)
  const [isHiding, setIsHiding] = useState(false)

  useEffect(() => {
    if (show) {
      setCountdown(5)
      setIsHiding(false)
      requestAnimationFrame(() => setIsVisible(true))
    } else {
      setIsVisible(false)
      setIsHiding(false)
    }
  }, [show])

  useEffect(() => {
    if (!show || !autoClose || countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          handleClose()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [show, autoClose, countdown, onClose])

  const handleClose = useCallback(() => {
    setIsHiding(true)
    setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => {
        setIsHiding(false)
        onClose()
        localStorage.setItem(POPUP_KEY, '1')
      }, 600)
    }, 50)
  }, [onClose])

  if (!show && !isHiding) return null

  return (
    <>
      <div
        className={`popup-overlay ${isVisible && !isHiding ? 'popup-overlay-show' : ''}`}
        onClick={handleClose}
      />
      <div className={`popup-container ${isVisible && !isHiding ? 'popup-container-show' : ''} ${isHiding ? 'popup-container-hide' : ''}`}>
        <button className="popup-close" onClick={handleClose}>✕</button>

        <div className="popup-body">
          <div className="popup-qr-group">
            <div className="popup-qr-item">
              <p className="popup-qr-tag-top">微信搜一搜 · <strong>玩云盒</strong></p>
              <div className="popup-qr-box popup-qr-img">
                <img src="/gzh.webp" alt="公众号二维码" />
              </div>
            </div>

            <div className="popup-qr-item">
              <p className="popup-qr-tag-top">赞助我们 · 您的支持是动力</p>
              <div className="popup-qr-box popup-qr-img">
                <img src="/zanzhu.webp" alt="赞助二维码" />
              </div>
            </div>
          </div>
        </div>

        <div className="popup-footer">
          <a
            href="https://10000yun.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="popup-link"
          >
            🌐 访问玩云盒子官网
          </a>
          {autoClose && (
            <p className="popup-countdown">
              {countdown}秒后自动关闭
            </p>
          )}
        </div>
      </div>
    </>
  )
}

export function isPopupDismissed(): boolean {
  return !!localStorage.getItem(POPUP_KEY)
}

export function clearPopupDismissed() {
  localStorage.removeItem(POPUP_KEY)
}
