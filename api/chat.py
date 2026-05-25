import os
import json
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv
from pypdf import PdfReader

# Cargar entorno
ruta_actual = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(ruta_actual, '..', '.env'))

app = Flask(__name__)
CORS(app) 

# Configurar llave
api_key = os.environ.get("VITE_GEMINI_API_KEY")
genai.configure(api_key=api_key)

# Auto-detectar modelo
modelo_elegido = 'models/gemini-1.5-flash-latest'
try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods and 'gemini' in m.name.lower():
            modelo_elegido = m.name
            break
except Exception as e:
    print("Error buscando modelos:", e)

print(f"✅ Motor de IA conectado usando: {modelo_elegido}")
model = genai.GenerativeModel(modelo_elegido)

def cargar_catalogo_pdf():
    print("Cargando el PDF del catálogo en memoria... ⏳")
    ruta_pdf = os.path.join(ruta_actual, '..', 'catalogo2026.pdf')
    texto_completo = ""
    try:
        reader = PdfReader(ruta_pdf)
        for page in reader.pages:
            texto_extraido = page.extract_text()
            if texto_extraido:
                texto_completo += texto_extraido + "\n"
        print("✅ ¡PDF cargado exitosamente en RAM!")
        return texto_completo
    except FileNotFoundError:
        print("❌ Error: No se encontró el archivo catalogo2026.pdf")
        return "Catálogo no encontrado."
    except Exception as e:
        print(f"❌ Error leyendo el PDF: {e}")
        return "Error leyendo el catálogo."

catalogo_texto = cargar_catalogo_pdf()

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    pregunta_usuario = data.get('pregunta', '')
    historial = data.get('historial', [])

    if not pregunta_usuario:
        return jsonify({"error": "No enviaste ninguna pregunta."}), 400

    historial_texto = ""
    for msg in historial[-6:]:
        rol = "Usuario" if msg['role'] == 'user' else "Ateneo IA"
        historial_texto += f"{rol}: {msg['text']}\n"

    if len(historial) > 0:
        regla_saludo = "REGLA DE CONVERSACIÓN: Como ya saludaste al usuario en mensajes anteriores, TIENES ESTRICTAMENTE PROHIBIDO volver a saludar (no uses '¡Hola!', 'Buenos días', 'Es un gusto', etc.). Ve directo al grano y responde la pregunta."
    else:
        regla_saludo = "REGLA DE CONVERSACIÓN: Es el primer mensaje del usuario. Salúdalo amablemente de forma muy breve antes de responder."

    prompt_sistema = f"""
    Eres 'Ateneo IA', el asistente educativo virtual de la Universidad Modular Abierta (UMA), específicamente para el Centro Regional de Santa Ana.
    Tu objetivo es responder de forma profesional y concisa a cualquier usuario.
    
    REGLA ESTRICTA 1: Basa tus respuestas ÚNICAMENTE en la información de este documento oficial. 
    Si te preguntan algo que no está aquí, di amablemente que no tienes esa información y sugiere contactar a la administración.
    
    REGLA ESTRICTA 2 (SUGERENCIAS): Al final de cada respuesta, debes incluir siempre UNA sola pregunta o sugerencia corta para invitar al usuario a seguir explorando el tema relacionado. 
    Ejemplos de cómo cerrar: "¿Te gustaría conocer el pensum de esta carrera?", "¿Deseas que te comparta los requisitos de inscripción?", "¿Quieres saber sobre las opciones de graduación?". No hagas listas largas, solo una frase sutil de cierre.
    
    {regla_saludo}
    
    DOCUMENTO OFICIAL (Catálogo UMA 2026):
    {catalogo_texto}
    
    HISTORIAL DE LA CONVERSACIÓN RECIENTE:
    {historial_texto}
    
    Pregunta actual del usuario: {pregunta_usuario}
    """

    def generar_respuesta():
        try:
            respuesta = model.generate_content(prompt_sistema, stream=True)
            for trozo in respuesta:
                if trozo.text:
                    yield f"data: {json.dumps({'texto': trozo.text})}\n\n"
            yield "data: [FIN]\n\n"
        except Exception as e:
            # Interceptor de errores de límite de cuota
            error_str = str(e).lower()
            if "429" in error_str or "quota" in error_str or "exhausted" in error_str:
                yield f"data: {json.dumps({'error': 'QUOTA_REACHED'})}\n\n"
            else:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(generar_respuesta(), content_type='text/event-stream')

if __name__ == '__main__':
    app.run(debug=True, port=5328)