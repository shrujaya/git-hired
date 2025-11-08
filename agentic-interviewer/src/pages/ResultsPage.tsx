// src/pages/ResultsPage.tsx
import { useParams, useNavigate } from 'react-router-dom'

function ResultsPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full p-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-4 text-center">
          Interview Results
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Session ID: {sessionId}
        </p>
        
        {/* TODO: Add score display */}
        {/* TODO: Add transcript */}
        {/* TODO: Add summary report */}
        
        <div className="text-center">
          <button
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
          >
            Start New Interview
          </button>
        </div>
      </div>
    </div>
  )
}

export default ResultsPage
