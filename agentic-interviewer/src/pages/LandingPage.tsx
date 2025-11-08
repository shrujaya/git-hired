// src/pages/LandingPage.tsx
import { useNavigate } from 'react-router-dom'

function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-4 text-center">
          Interview Setup
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Upload your resume and job description
        </p>
        
        {/* TODO: Add resume upload */}
        {/* TODO: Add job description input */}
        
        <div className="text-center">
          <button
            onClick={() => navigate('/interview')}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
          >
            Start Interview
          </button>
        </div>
      </div>
    </div>
  )
}

export default LandingPage
