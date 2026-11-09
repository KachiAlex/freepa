import { Suspense } from 'react'
import AppRouter from './routes/AppRouter'

function App() {
  return (
    <Suspense fallback={<div className="app-loading">Loading...</div>}>
      <AppRouter />
    </Suspense>
  )
}

export default App
