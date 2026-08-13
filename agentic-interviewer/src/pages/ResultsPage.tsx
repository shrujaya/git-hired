// src/pages/ResultsPage.tsx
// Interview-complete page: the drawing is signed off. One centered sheet with
// the facts of the session, stamped approved in redline.

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
    <div className="min-h-screen sheet text-ink flex items-center justify-center p-6 md:p-10">
      <div className="w-[520px] max-w-full animate-fadeup">
        <div className="border-2 border-ink bg-card">
          {/* Stamp row */}
          <div className="flex items-center justify-between px-7 pt-7">
            <span className="inline-block border-2 border-signal px-3 py-1.5 -rotate-2">
              <span className="font-mono uppercase tracking-[0.16em] text-[11px] font-medium text-signal leading-none">
                Submitted
              </span>
            </span>
            <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-inkfaint text-right">
              Sheet 3 of 3<br />complete
            </span>
          </div>

          <div className="px-7 pt-6 pb-7">
            <h1 className="font-display font-extrabold text-[30px] tracking-title leading-[1.04] mb-3">
              Interview<br />submitted
            </h1>
            <span className="redline w-16 mb-4" />
            <p className="text-[14px] leading-relaxed text-inksub mb-6">
              Nicely done, {userName}. Your transcript, code, and recording are
              with the hiring team — you'll hear back by email within five
              business days.
            </p>

            {/* Record table */}
            <div className="border-2 border-ink divide-y divide-rule mb-5">
              {[
                ['Candidate', userName],
                ['Role', jobTitle],
                ['Duration', timeElapsed],
                ['Expected response', responseBy],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                  <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-inksub self-center">
                    {k}
                  </span>
                  <span
                    className={
                      'text-[13px] font-medium text-right truncate ' +
                      (k === 'Duration' ? 'font-mono text-[12px]' : '')
                    }
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>

            <div className="px-[18px] py-4 bg-wash border border-washline mb-6">
              <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-inksub mb-2">
                Note — what happens next
              </div>
              <div className="text-[13px] leading-relaxed text-ink">
                Our AI has transcribed and analyzed your interview to help the
                team review it fairly and consistently. All data is stored
                securely and kept confidential.
              </div>
            </div>

            <button
              onClick={handleGoHome}
              className="w-full py-3.5 border-2 border-signal bg-transparent hover:bg-signal hover:text-black text-signal text-[14px] font-medium cursor-pointer transition-colors"
            >
              Back to start
            </button>

            <p className="text-xs text-inkfaint text-center mt-5">
              Questions? Email{' '}
              <a
                href="mailto:support@company.com"
                className="text-ink underline decoration-signal decoration-2 underline-offset-2 hover:text-signal"
              >
                support@company.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InterviewCompletePage
