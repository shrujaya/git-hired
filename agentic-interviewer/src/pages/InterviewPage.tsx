// src/pages/InterviewPage.tsx
import { useNavigate } from 'react-router-dom'

function InterviewPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full p-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-4 text-center">
          Interview in Progress
        </h1>
        <p className="text-gray-600 text-center mb-8">
          This is where the actual interview will happen
        </p>
        
        {/* TODO: Add video feed */}
        {/* TODO: Add interviewer agent */}
        {/* TODO: Add code editor */}
        {/* TODO: Add question display */}
        
        <div className="text-center">
          <button
            onClick={() => navigate('/results/123')}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold"
          >
            End Interview (Demo)
          </button>
        </div>
      </div>
    </div>
  )
}

export default InterviewPage
