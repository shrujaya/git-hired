// src/pages/InterviewCompletePage.tsx
// Professional interview completion page with creative elements

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  CheckCircle, 
  Mail, 
  Calendar,
  Clock,
  Star,
  MessageSquare,
  Home,
  FileText,
  TrendingUp,
  Users,
  Sparkles,
  Award,
  ThumbsUp
} from 'lucide-react'

function InterviewCompletePage() {
  const navigate = useNavigate()
  const [timeElapsed, setTimeElapsed] = useState('--:--')
  const [userName, setUserName] = useState('Candidate')
  const [jobTitle, setJobTitle] = useState('Position')
  const [showConfetti, setShowConfetti] = useState(true)

  useEffect(() => {
    // Get stored data
    const storedName = localStorage.getItem('candidateName') || 'Candidate'
    const storedJob = localStorage.getItem('jobTitle') || 'Position'
    const startTime = localStorage.getItem('interviewStartTime')
    
    setUserName(storedName)
    setJobTitle(storedJob)

    // Calculate time elapsed
    if (startTime) {
      const elapsed = Date.now() - parseInt(startTime)
      const minutes = Math.floor(elapsed / 60000)
      const seconds = Math.floor((elapsed % 60000) / 1000)
      setTimeElapsed(`${minutes}:${seconds.toString().padStart(2, '0')}`)
    }

    // Hide confetti after animation
    setTimeout(() => setShowConfetti(false), 3000)
  }, [])

  const handleGoHome = () => {
    // Clear interview data
    localStorage.removeItem('interviewStartTime')
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-green-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      {/* Confetti Effect */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 20}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 2}s`
              }}
            >
              <Sparkles className="w-4 h-4 text-yellow-400" />
            </div>
          ))}
        </div>
      )}

      <div className="relative z-10 flex items-center justify-center min-h-screen p-4 sm:p-6">
        <div className="max-w-4xl w-full">
          {/* Main Success Card */}
          <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 mb-6 text-center transform transition-all">
            {/* Success Icon */}
            <div className="mb-6">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto shadow-lg animate-bounce-once">
                <CheckCircle className="w-12 h-12 sm:w-14 sm:h-14 text-white" />
              </div>
            </div>

            {/* Success Message */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Interview Complete! 🎉
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 mb-8">
              Great job, <span className="font-semibold text-indigo-600">{userName}</span>! 
              You've successfully completed the <span className="font-semibold">{jobTitle}</span> interview.
            </p>

            {/* Decorative Line */}
            <div className="flex items-center justify-center mb-8">
              <div className="h-1 w-24 bg-gradient-to-r from-transparent via-green-500 to-transparent rounded"></div>
            </div>

            {/* Key Message */}
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-6 sm:p-8 mb-8 border-2 border-green-100">
              <div className="flex items-start gap-4 mb-4">
                <Mail className="w-8 h-8 text-green-600 flex-shrink-0 mt-1" />
                <div className="text-left">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    What Happens Next?
                  </h3>
                  <p className="text-gray-700 leading-relaxed">
                    Our hiring team is reviewing your interview. You'll receive a detailed 
                    email with feedback and next steps within <span className="font-semibold text-green-600">3-5 business days</span>.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600 bg-white rounded-lg px-4 py-3">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Expected response: <span className="font-semibold">by {new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span></span>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Time Spent */}
            <div className="bg-white rounded-xl shadow-lg p-5 text-center transform hover:scale-105 transition-transform">
              <Clock className="w-8 h-8 text-blue-600 mx-auto mb-3" />
              <p className="text-2xl font-bold text-gray-900 mb-1">{timeElapsed}</p>
              <p className="text-xs text-gray-600">Time Spent</p>
            </div>

            {/* Status */}
            <div className="bg-white rounded-xl shadow-lg p-5 text-center transform hover:scale-105 transition-transform">
              <Award className="w-8 h-8 text-green-600 mx-auto mb-3" />
              <p className="text-2xl font-bold text-green-600 mb-1">Completed</p>
              <p className="text-xs text-gray-600">Interview Status</p>
            </div>

            {/* Position */}
            <div className="bg-white rounded-xl shadow-lg p-5 text-center transform hover:scale-105 transition-transform">
              <Star className="w-8 h-8 text-purple-600 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-900 mb-1 truncate">{jobTitle}</p>
              <p className="text-xs text-gray-600">Position Applied</p>
            </div>

            {/* AI Powered */}
            <div className="bg-white rounded-xl shadow-lg p-5 text-center transform hover:scale-105 transition-transform">
              <Sparkles className="w-8 h-8 text-yellow-600 mx-auto mb-3" />
              <p className="text-2xl font-bold text-gray-900 mb-1">AI</p>
              <p className="text-xs text-gray-600">Powered Interview</p>
            </div>
          </div>

          {/* Info Cards Grid */}
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {/* What We're Evaluating */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">We're Evaluating</h3>
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <ThumbsUp className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Technical knowledge and problem-solving</span>
                </li>
                <li className="flex items-start gap-2">
                  <ThumbsUp className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Communication and clarity of thought</span>
                </li>
                <li className="flex items-start gap-2">
                  <ThumbsUp className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Cultural fit and team compatibility</span>
                </li>
                <li className="flex items-start gap-2">
                  <ThumbsUp className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Relevant experience and skills</span>
                </li>
              </ul>
            </div>

            {/* Meanwhile, You Can */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Meanwhile</h3>
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <Mail className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span>Check your email regularly for updates</span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span>Connect with us on LinkedIn</span>
                </li>
                <li className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <span>Prepare questions for the next round</span>
                </li>
                <li className="flex items-start gap-2">
                  <Star className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <span>Review the job description again</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Interview Recording Info */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg p-6 mb-6 text-white">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">Interview Recording & Transcript</h3>
                <p className="text-blue-100 text-sm leading-relaxed mb-3">
                  Your interview has been recorded and transcribed. Our AI has generated a detailed 
                  analysis that will be shared with the hiring team. This helps ensure fair and 
                  consistent evaluation.
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>All data is securely stored and confidential</span>
                </div>
              </div>
            </div>
          </div>

          {/* Feedback Section */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 text-center">
              Help Us Improve
            </h3>
            <p className="text-sm text-gray-600 text-center mb-4">
              How was your interview experience? (Optional)
            </p>
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  className="w-12 h-12 rounded-full border-2 border-gray-300 hover:border-yellow-400 hover:bg-yellow-50 transition-all flex items-center justify-center group"
                >
                  <Star className="w-6 h-6 text-gray-400 group-hover:text-yellow-400 group-hover:fill-yellow-400 transition-all" />
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 text-center">
              Your feedback helps us create better interview experiences
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleGoHome}
              className="group px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all transform hover:scale-105 flex items-center justify-center gap-2"
            >
              <Home className="w-5 h-5" />
              Back to Home
            </button>
            
            <button
              onClick={() => window.open('mailto:support@company.com', '_blank')}
              className="px-8 py-4 bg-white border-2 border-gray-300 hover:border-indigo-600 text-gray-700 hover:text-indigo-600 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <Mail className="w-5 h-5" />
              Contact Support
            </button>
          </div>

          {/* Footer Note */}
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-600">
              Questions? Email us at <a href="mailto:support@company.com" className="text-indigo-600 hover:underline font-medium">support@company.com</a>
            </p>
            <p className="text-xs text-gray-500 mt-2">
              © 2024 AI Tech Interviewer. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        
        @keyframes confetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
        
        @keyframes bounce-once {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        
        .animate-blob {
          animation: blob 7s infinite;
        }
        
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        
        .animate-confetti {
          animation: confetti linear forwards;
        }
        
        .animate-bounce-once {
          animation: bounce-once 0.6s ease-in-out;
        }
      `}</style>
    </div>
  )
}

export default InterviewCompletePage