import { InfiniteCanvas } from "./components/InfiniteCanvas"
import { LanguageProvider } from "./i18n"

export function App() {
  return (
    <LanguageProvider>
      <InfiniteCanvas />
    </LanguageProvider>
  )
}

export default App
