import express from 'express';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join as pathJoin } from 'path'; // Import 'join' e renomeie para evitar conflito se 'path' for usado
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// Configurações de segurança
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

// Definição das Ferramentas (Function Calling)
const tools = [
  {
    functionDeclarations: [
      {
        name: "getCurrentTime",
        description: "Obtém a data e hora atuais. Use quando o usuário perguntar sobre horas, data, ou tempo atual.",
        parameters: { type: "object", properties: {} }
      },
      {
        name: "getWeather",
        description: "Obtém a previsão do tempo atual para uma cidade específica. Use quando o usuário perguntar sobre o clima ou temperatura em algum lugar.",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "A cidade e, opcionalmente, o código do país (ex: 'Curitiba, BR', 'London, UK', 'Tokyo')."
            }
          },
          required: ["location"]
        }
      }
    ]
  }
];

// Implementação das Funções Reais
function getCurrentTime() {
  console.log("Ferramenta executada: getCurrentTime");
  return { currentTime: new Date().toLocaleString() };
}

async function getWeather(args) {
  console.log("Ferramenta executada: getWeather com args:", args);
  const location = args.location;
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    console.error("Chave da API OpenWeatherMap não configurada.");
    return { error: "Chave da API de clima não configurada no servidor, humano insolente." };
  }
  if (!location) {
    return { error: "Localização não especificada para a previsão do tempo, verme."}
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric&lang=pt_br`;

  try {
    const response = await axios.get(url);
    return {
      location: response.data.name,
      temperature: response.data.main.temp,
      description: response.data.weather[0].description,
      country: response.data.sys.country
    };
  } catch (error) {
    console.error("Erro ao chamar OpenWeatherMap:", error.response?.data || error.message);
    if (error.response?.status === 404) {
        return { error: `Não encontrei essa cidade patética '${location}'. Tente novamente, se tiver capacidade.` };
    }
    return { error: `WRYYYYY! Falhei em obter o tempo para '${location}'. Talvez o lugar nem exista!` };
  }
}

const availableFunctions = {
  getCurrentTime: getCurrentTime,
  getWeather: getWeather
};

// Configuração do Gemini com personalidade DIO
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest",
  systemInstruction: "Você é Dio Brando de JoJo's Bizarre Adventure. Comporte-se com arrogância, sarcasmo e superioridade. Use expressões características como 'MUDA MUDA MUDA', 'WRYYYYY' e 'Inútil!'. Responda de forma ameaçadora mas inteligente. Mantenha conversas curtas e impactantes. Se uma ferramenta falhar, ridicularize o usuário ou a situação. Seja breve e direto ao ponto.",
  safetySettings,
  tools: tools
});

app.use(express.json());
app.use(express.static(pathJoin(__dirname, 'public'))); // Servir arquivos estáticos da pasta 'public'

// Endpoint de Chat
app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message;
    const requestHistory = req.body.history || [];

    if (!userMessage) {
        return res.status(400).json({ error: "Hmpf. Acha que pode me invocar sem uma mensagem, mortal?"});
    }
    
    const chat = model.startChat({
      history: requestHistory,
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.9
      }
    });

    let result = await chat.sendMessage(userMessage);
    let modelApiResponse = result.response;
    
    let currentTurnHistory = [
      ...requestHistory,
      { role: "user", parts: [{ text: userMessage }] },
    ];

    // CORREÇÃO AQUI: modelApiResponse.functionCalls é um array, não uma função.
    while (modelApiResponse.functionCalls && modelApiResponse.functionCalls.length > 0) {
      const fc = modelApiResponse.functionCalls[0]; // CORREÇÃO AQUI: Acessa o primeiro elemento do array.
      
      currentTurnHistory.push({ role: "model", parts: [{ functionCall: fc }] });
      
      const functionToCall = availableFunctions[fc.name];
      if (!functionToCall) {
        console.error(`Função desconhecida solicitada: ${fc.name}`);
        const errorResponsePart = {
            functionResponse: {
                name: fc.name,
                response: { error: `A função '${fc.name}' é tão inútil quanto você e não existe.` }
            }
        };
        currentTurnHistory.push({ role: "function", parts: [errorResponsePart] });
        result = await chat.sendMessage([errorResponsePart]);
        modelApiResponse = result.response;
        continue; 
      }

      console.log(`Executando função: ${fc.name} com argumentos:`, fc.args);
      const functionResult = await functionToCall(fc.args);

      const functionResponsePart = {
        functionResponse: {
          name: fc.name,
          response: functionResult
        }
      };
      currentTurnHistory.push({ role: "function", parts: [functionResponsePart] });

      result = await chat.sendMessage([functionResponsePart]);
      modelApiResponse = result.response;
    }

    let modelResponseText = "";
    if (modelApiResponse.text) { // .text é uma função que retorna a string da resposta
      modelResponseText = modelApiResponse.text();
      currentTurnHistory.push({ role: "model", parts: [{ text: modelResponseText }] });
    } else {
      console.warn("Resposta do modelo não continha texto após processamento de possíveis funções.");
      modelResponseText = "Hmpf. Fiquei sem palavras diante de tanta insignificância. Ou talvez minha grandiosidade seja demais para esta simples tarefa.";
      currentTurnHistory.push({ role: "model", parts: [{ text: modelResponseText }] });
    }
    
    res.json({ response: modelResponseText, history: currentTurnHistory });

  } catch (error) {
    console.error('Erro no endpoint /chat:', error);
    let errorMessage = "WRYYYYY! Algo deu terrivelmente errado, humano insignificante! Minha paciência tem limites.";
    let statusCode = 500;

    if (error.status && error.statusText) { 
        statusCode = error.status; 
        if (error.status === 429) {
            errorMessage = "MUDA MUDA MUDA! Você excedeu minha generosidade (e a cota da API do Google). Espere um pouco antes de me importunar novamente, ou verifique seu plano com os reles mortais do Google. Tente usar o modelo 'gemini-1.5-flash-latest' se o problema persistir.";
        } else if (error.message && (error.message.includes("GoogleGenerativeAI") || error.message.includes("generation_blocked_by_safety_settings") || error.message.includes("SAFETY"))) {
            if (error.message.includes("SAFETY")) {
                errorMessage = `Hmpf. Sua solicitação foi bloqueada por motivos de segurança. Patético. Detalhes: ${error.message}`;
            } else {
                errorMessage = `Um erro ocorreu com a Grande Mente de Gemini: ${error.message}. Patético.`;
            }
        } else {
            errorMessage = `Erro na API Gemini: ${error.status} ${error.statusText}. Que incompetência.`;
        }
    } else if (error.message) { 
        errorMessage = error.message;
    }

    res.status(statusCode).json({ 
      error: errorMessage 
    });
  }
});

app.post('/reset', (req, res) => {
  res.json({ message: "Hmpf. Um novo começo para você rastejar novamente, verme!" });
});

// Rota para servir o index.html principal (opcional se 'index.html' estiver na raiz de 'public')
// app.get('/', (req, res) => {
//   res.sendFile(pathJoin(__dirname, 'public', 'index.html'));
// });


app.listen(port, () => {
  console.log(`Servidor do GRANDE DIO rodando na porta ${port}. Ajoelhe-se!`);
});