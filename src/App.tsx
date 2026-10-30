import { InfiniteCanvas } from "./components/InfiniteCanvas"
import { LanguageProvider } from "./i18n"
import { ErrorBoundary } from "./components/ErrorBoundary"

export function App() {
  return (
    <ErrorBoundary name="App">
      <LanguageProvider>
        <InfiniteCanvas />
      </LanguageProvider>
    </ErrorBoundary>
  )
}

export default App
