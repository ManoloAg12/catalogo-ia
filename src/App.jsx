import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon, Search, Sparkles, Send, User, MessageCircle, Copy, Check, ArrowDown, RotateCcw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm' // NUEVO: Importación para soportar tablas

const FAQ_SUGGESTIONS = [
  "¿Cuáles son las carreras disponibles?",
  "¿Cuáles son los aranceles de matrícula y cuotas?",
  "¿Qué opciones de graduación ofrece la universidad?",
  "¿Cuáles son las carreras semi-presenciales disponibles?"
];

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })
  
  const [query, setQuery] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  // NUEVOS ESTADOS PARA UI
  const [copiedIndex, setCopiedIndex] = useState(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)
  const chatContainerRef = useRef(null) // Referencia para detectar el scroll manual

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [darkMode])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e) => setDarkMode(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Auto-scroll al final cuando hay nuevos mensajes (si el usuario no ha subido manualmente)
  useEffect(() => {
    if (!showScrollButton) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, isLoading])

  // Lógica para mostrar/ocultar el botón flotante de scroll
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    // Si la distancia al fondo es mayor a 100px, mostramos el botón
    const isNotAtBottom = scrollHeight - scrollTop - clientHeight > 100
    setShowScrollButton(isNotAtBottom)
  }

  // Función para bajar al final manualmente
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    setShowScrollButton(false)
  }

  // Función para copiar respuesta
  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000) // Vuelve al ícono normal en 2s
  }

  // Función para reiniciar el chat
  const handleResetChat = () => {
    setHasSearched(false)
    setMessages([])
    setQuery('')
  }

  const handleInputChange = (e) => {
    setQuery(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (query.trim() && !isLoading) {
        submitQuestion(query)
      }
    }
  }

  useEffect(() => {
    if (query === '' && inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }, [query])

  const submitQuestion = async (textToSearch) => {
    if (!textToSearch.trim()) return

    setQuery('')
    setShowSuggestions(false)
    setHasSearched(true)
    setIsLoading(true) 
    setShowScrollButton(false) // Forzamos bajar al enviar nuevo mensaje

    setMessages(prev => [...prev, { role: 'user', text: textToSearch }])

    try {
     const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pregunta: textToSearch,
          historial: messages 
        })
      })
      
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let iaMensajeCompleto = ''
      let isFirstChunk = true 

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lineas = chunk.split('\n')

        for (const linea of lineas) {
          if (linea.startsWith('data: ')) {
            const dataStr = linea.slice(6)
            if (dataStr === '[FIN]') {
              setIsLoading(false)
              return 
            }

            try {
              const data = JSON.parse(dataStr)
              if (data.error) {
                if (isFirstChunk) {
                  setIsLoading(false)
                  setMessages(prev => [...prev, { role: 'ai', text: `Error: ${data.error}` }])
                  isFirstChunk = false
                } else {
                  setMessages(prev => {
                    const nuevos = [...prev]
                    nuevos[nuevos.length - 1].text += `\n\nError: ${data.error}`
                    return nuevos
                  })
                }
              } else if (data.texto) {
                iaMensajeCompleto += data.texto
                
                if (isFirstChunk) {
                  setIsLoading(false)
                  setMessages(prev => [...prev, { role: 'ai', text: iaMensajeCompleto }])
                  isFirstChunk = false
                } else {
                  setMessages(prev => {
                    const nuevos = [...prev]
                    nuevos[nuevos.length - 1].text = iaMensajeCompleto
                    return nuevos
                  })
                }
              }
            } catch (e) {
              console.error('Error procesando fragmento de datos', e)
            }
          }
        }
      }
    } catch (error) {
      setIsLoading(false)
      setMessages(prev => [...prev, { role: 'ai', text: "Error de conexión con el servidor Python." }])
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    submitQuestion(query)
  }

  const SuggestionsDropdown = () => (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-gray-900 border border-red-100 dark:border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden"
    >
      <div className="px-4 py-3 text-xs font-bold text-red-800/60 dark:text-gray-500 uppercase tracking-wider bg-red-50/50 dark:bg-gray-900/50 border-b border-red-100 dark:border-gray-800">
        Preguntas Frecuentes
      </div>
      {FAQ_SUGGESTIONS.map((sug, i) => (
        <button
          key={i}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            submitQuestion(sug)
          }}
          className="w-full text-left px-4 py-3.5 hover:bg-red-50 dark:hover:bg-gray-800 transition-colors border-b last:border-b-0 border-red-50 dark:border-gray-800 flex items-center gap-3 text-sm md:text-base text-gray-700 dark:text-gray-300 group"
        >
          <MessageCircle size={18} className="text-red-300 dark:text-gray-500 group-hover:text-red-600 dark:group-hover:text-gray-300 transition-colors shrink-0" />
          <span>{sug}</span>
        </button>
      ))}
    </motion.div>
  )

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-black text-gray-900 dark:text-gray-100 transition-colors duration-500 font-sans overflow-hidden">
      
      {/* Header Centrado */}
      <header className="shrink-0 p-4 md:px-8 flex justify-between items-center max-w-5xl mx-auto w-full relative z-30 bg-white/80 dark:bg-black/80 backdrop-blur-sm">
        <h1 className="text-xl md:text-2xl font-bold tracking-wide flex items-center gap-2 text-red-800 dark:text-white">
          <Sparkles className="text-red-700 dark:text-white" size={24} />
          Ateneo IA
        </h1>
        <div className="flex items-center gap-2">
          {hasSearched && (
            <button 
              onClick={handleResetChat} 
              title="Nueva Consulta"
              className="p-2.5 rounded-full hover:bg-red-50 dark:hover:bg-gray-800 transition-colors text-red-800 dark:text-gray-300"
            >
              <RotateCcw size={20} />
            </button>
          )}
          <button 
            onClick={() => setDarkMode(!darkMode)} 
            title="Alternar Tema"
            className="p-2.5 rounded-full hover:bg-red-50 dark:hover:bg-gray-800 transition-colors text-red-800 dark:text-gray-300"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 pb-6 flex flex-col overflow-hidden relative">
        
        {!hasSearched ? (
            <motion.div className="flex-1 flex flex-col justify-center items-center" layoutId="chat-container">
              <motion.div layoutId="header-text" className="text-center mb-8">
                <h2 className="text-4xl md:text-5xl font-extrabold mb-4 text-red-900 dark:text-white">¿Qué necesitas hoy?</h2>
                <p className="text-lg text-red-800/60 dark:text-gray-400">Consulta información institucional de UMA con nuestra IA.</p>
              </motion.div>

              <div className="w-full relative z-20 flex flex-col items-center">
                <motion.form layoutId="search-bar" onSubmit={handleSearch} className="w-full relative flex items-center shadow-xl shadow-red-900/5 dark:shadow-none rounded-2xl bg-white dark:bg-gray-900 border border-red-100 dark:border-gray-800 overflow-hidden group">
                  <Search className="absolute left-5 top-5 text-red-300 dark:text-gray-400 group-focus-within:text-red-700 dark:group-focus-within:text-white transition-colors" size={22} />
                  <textarea 
                    ref={inputRef}
                    rows={1}
                    value={query} 
                    onChange={handleInputChange} 
                    onKeyDown={handleKeyDown}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setShowSuggestions(false)}
                    placeholder="Haz una pregunta o elige una opción..." 
                    className="w-full py-[1.125rem] pl-14 pr-16 bg-transparent outline-none text-lg text-red-900 dark:text-white placeholder-red-300 dark:placeholder-gray-500 resize-none max-h-[160px] overflow-y-auto custom-scrollbar" 
                    disabled={isLoading} 
                  />
                  <button type="submit" disabled={!query.trim() || isLoading} className="absolute right-3 bottom-3 p-3 bg-red-800 hover:bg-red-900 disabled:bg-red-200 dark:bg-white dark:hover:bg-gray-200 dark:disabled:bg-gray-800 text-white dark:text-black rounded-xl transition-colors">
                    <Send size={18} />
                  </button>
                </motion.form>

                {showSuggestions && !query && <SuggestionsDropdown />}
              </div>
            </motion.div>
        ) : (
            <motion.div className="flex-1 flex flex-col h-full overflow-hidden relative" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              
              <div 
                ref={chatContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto custom-scrollbar pr-3 mb-6 space-y-8 pb-4"
              >
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    
                    {msg.role !== 'user' && (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-red-50 dark:bg-white text-red-800 dark:text-black border border-red-100 dark:border-transparent shadow-sm mt-1">
                        <Sparkles size={18} />
                      </div>
                    )}
                    
                    {/* Contenedor del Mensaje */}
                    <div className={`group relative p-5 rounded-3xl max-w-[90%] md:max-w-[80%] shadow-sm text-[15.5px] leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-red-800 text-white dark:bg-white dark:text-black rounded-tr-sm' 
                        : 'bg-white dark:bg-gray-900 border border-red-100 dark:border-gray-800 text-gray-800 dark:text-gray-100 rounded-tl-sm markdown-content'
                    }`}>
                      
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      ) : (
                        // Agregado remarkGfm para que renderice Tablas
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                      )}

                      {/* Botón de Copiar Respuesta (Aparece en Hover) */}
                      {msg.role !== 'user' && !isLoading && msg.text && (
                        <button
                          onClick={() => handleCopy(msg.text, idx)}
                          className="absolute -bottom-4 -right-2 md:opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-full shadow-md text-gray-500 hover:text-red-700 dark:text-gray-400 dark:hover:text-white"
                          title="Copiar respuesta"
                        >
                          {copiedIndex === idx ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
                      )}
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-red-100 dark:bg-gray-800 text-red-800 dark:text-white shadow-sm mt-1">
                        <User size={18} />
                      </div>
                    )}
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex gap-4 justify-start">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-red-50 dark:bg-white text-red-800 dark:text-black border border-red-100 dark:border-transparent shadow-sm mt-1">
                      <Sparkles size={18} />
                    </div>
                    <div className="py-4 px-5 rounded-3xl rounded-tl-sm bg-white dark:bg-gray-900 border border-red-100 dark:border-gray-800 shadow-sm flex items-center gap-3">
                      <span className="text-red-800/60 dark:text-gray-400 text-sm font-medium animate-pulse">
                        Ateneo IA está revisando el catálogo
                      </span>
                      <div className="flex gap-1.5 items-center h-full">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-300 dark:bg-gray-400 animate-bounce"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-red-300 dark:bg-gray-400 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-red-300 dark:bg-gray-400 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} className="h-4" />
              </div>

              {/* Botón Flotante para Bajar (Solo aparece al scrollear hacia arriba) */}
              <AnimatePresence>
                {showScrollButton && (
                  <motion.button
                    initial={{ opacity: 0, y: 10, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.8 }}
                    onClick={scrollToBottom}
                    className="absolute bottom-[5.5rem] right-[50%] translate-x-[50%] md:translate-x-0 md:right-8 z-30 p-2.5 bg-red-800/90 hover:bg-red-900 dark:bg-gray-800/90 dark:hover:bg-gray-700 text-white rounded-full shadow-lg backdrop-blur-sm transition-colors"
                  >
                    <ArrowDown size={20} />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Barra de Búsqueda Fija Inferior */}
              <div className="shrink-0 relative z-20 mt-auto bg-transparent pt-2">
                <motion.form layoutId="search-bar" onSubmit={handleSearch} className="w-full relative flex items-end shadow-lg shadow-red-900/5 dark:shadow-none rounded-2xl bg-white dark:bg-gray-900 border border-red-100 dark:border-gray-800 overflow-hidden group">
                  <Search className="absolute left-5 bottom-4 text-red-300 dark:text-gray-400 group-focus-within:text-red-700 dark:group-focus-within:text-white transition-colors" size={22} />
                  <textarea 
                    ref={inputRef}
                    rows={1}
                    value={query} 
                    onChange={handleInputChange} 
                    onKeyDown={handleKeyDown}
                    placeholder="Escribe un mensaje para Ateneo IA..." 
                    className="w-full py-[1.125rem] pl-14 pr-16 bg-transparent outline-none text-base text-red-900 dark:text-white placeholder-red-300 dark:placeholder-gray-500 relative z-10 resize-none max-h-[160px] overflow-y-auto custom-scrollbar" 
                    disabled={isLoading} 
                  />
                  <button type="submit" disabled={!query.trim() || isLoading} className="absolute right-2 bottom-2 p-3 bg-red-800 hover:bg-red-900 disabled:bg-red-200 dark:bg-white dark:hover:bg-gray-200 dark:disabled:bg-gray-800 text-white dark:text-black rounded-xl transition-colors z-20">
                    <Send size={18} />
                  </button>
                </motion.form>
              </div>

            </motion.div>
        )}
      </main>
    </div>
  )
}

export default App