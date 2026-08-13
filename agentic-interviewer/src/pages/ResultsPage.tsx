// src/pages/ResultsPage.tsx
// Interview-complete page in the Vantage light style: one centered card with
// the facts of the session, no decoration competing with them.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

function InterviewCompletePage() {
  const navigate = useNavigate()
  const [timeElapsed, setTimeElapsed] = useState('--:--')
  const [userName, setUserName] = useState('Candidate')
  const [jobTitle, setJobTitle] = useState('Position')

  useEffect(() => {
    // Get stored data
    const storedName = localStorage.getItem('candidateName') || 'Candidate'
    const storedJob = localStorage.getItem('jobTitle') || 'Position'

    setUserName(storedName)
    setJobTitle(storedJob)

    // How long the interview took. This is a finished measurement taken when
    // the candidate left the interview, not a running clock - it must not keep
    // climbing while they read this page.
    const recorded = sessionStorage.getItem('interviewDuration')
    // Sessions that ended before the duration was recorded only left a start
    // timestamp behind. Read it once so the tile still shows something, rather
    // than ticking as it used to.
    const startTime = sessionStorage.getItem('sessionStart')
    const totalSeconds = recorded
      ? parseInt(recorded, 10)
      : startTime
        ? Math.floor((Date.now() - parseInt(startTime, 10)) / 1000)
        : NaN

    if (Number.isFinite(totalSeconds) && totalSeconds >= 0) {
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      setTimeElapsed(`${minutes}:${seconds.toString().padStart(2, '0')}`)
    }
  }, [])

  const handleGoHome = () => {
    // Clear interview data
    localStorage.clear();
    sessionStorage.clear()
    navigate('/')
  }

  const responseBy = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString(
    'en-US',
    { month: 'long', day: 'numeric', year: 'numeric' }
  )

  return (
    <div className="min-h-screen bg-mist text-ink flex items-center justify-center p-6 md:p-10">
      <div className="w-[480px] max-w-full border border-line rounded-[14px] bg-white p-7 md:p-8 animate-fadeup">
        <div className="w-[34px] h-[34px] rounded-[9px] bg-[#EAF1F2] flex items-center justify-center text-brand text-[15px] mb-[18px]">
          ✓
        </div>

        <h1 className="text-[23px] font-semibold tracking-tight mb-2">
          Interview submitted
        </h1>
        <p className="text-sm leading-relaxed text-muted mb-6">
          Nicely done, {userName}. Your transcript, code, and recording are with
          the hiring team — you'll hear back by email within five business days.
        </p>

        <div className="flex flex-col gap-[11px] px-[18px] py-4 rounded-[10px] bg-[#FAFCFC] border border-hairline mb-5">
          <div className="flex justify-between gap-4 text-[13px]">
            <span className="text-faint">Candidate</span>
            <span className="font-medium text-right truncate">{userName}</span>
          </div>
          <div className="flex justify-between gap-4 text-[13px]">
            <span className="text-faint">Role</span>
            <span className="font-medium text-right truncate">{jobTitle}</span>
          </div>
          <div className="flex justify-between gap-4 text-[13px]">
            <span className="text-faint">Duration</span>
            <span className="font-medium font-mono">{timeElapsed}</span>
          </div>
          <div className="flex justify-between gap-4 text-[13px]">
            <span className="text-faint">Expected response</span>
            <span className="font-medium text-right">{responseBy}</span>
          </div>
        </div>

        <div className="px-[18px] py-4 rounded-[10px] bg-brand-wash border border-brand-washline mb-6">
          <div className="text-[13px] font-semibold mb-1.5">What happens next</div>
          <div className="text-[13px] leading-relaxed text-[#46595C]">
            Our AI has transcribed and analyzed your interview to help the team
            review it fairly and consistently. All data is stored securely and
            kept confidential.
          </div>
        </div>

        <button
          onClick={handleGoHome}
          className="w-full py-[13px] rounded-[10px] border border-line bg-white text-ink text-sm font-medium cursor-pointer hover:bg-[#FAFCFC] transition-colors"
        >
          Back to start
        </button>

        <p className="text-xs text-faint text-center mt-5">
          Questions? Email{' '}
          <a
            href="mailto:support@company.com"
            className="text-brand hover:text-brand-deep hover:underline"
          >
            support@company.com
          </a>
        </p>
      </div>
    </div>
  )
}

export default InterviewCompletePage
