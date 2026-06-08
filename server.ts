import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;
const VERSION = '1.0.0';

// Config store file pathway
const CONFIG_FILE = path.join(process.cwd(), 'config.json');

interface TelegramConfig {
  token: string;
  chatId: string;
  botUsername: string;
}

// In-memory data structures
interface ChatMessage {
  id: string;
  sender: 'user' | 'bot' | 'operator';
  text: string;
  timestamp: number;
}

interface UserSession {
  sessionId: string;
  name: string;
  city: string;
  messages: ChatMessage[];
  lastActive: number;
}

// Session state storage
const sessions: Record<string, UserSession> = {};
// Mapping of Telegram message IDs back to website session IDs
const telegramToSession: Record<string, string> = {};

// Store conversation states of Telegram users chatting directly with the bot
const telegramSessions: Record<string, any[]> = {};
const telegramSessionStates: Record<string, any> = {};

function getSystemInstructionForState(state: any): string {
  let stepGuidance = '';
  const currentStep = state?.step || 'START';

  if (currentStep === 'START' || currentStep === 'ASKED_NAME') {
    stepGuidance = `We are currently in Step 1 & 2: Getting the guest's Name.
- Seductively ask: "Hey handsome! Mera naam Priya hai. ❤️ Kya mai aapka pyaara naam jaan sakti hoon? 😉"
- If they gave an obviously fake name, non-alphabet, gibberish/symbols, or a country/city name (e.g. "usa", "india", "delhi", "mumbai", "jaipur" or non-human word), politely decline and confirm their real name: "Arey handsome, please apna real name batayiye na taki hum chat start kar sakein! ❤️"
- Do NOT proceed to ask about locations or time slots until they provide a real name! Keep demanding their real name politely.`;
  } else if (currentStep === 'ASKED_LOCATION') {
    stepGuidance = `We are currently in Step 3: Asking about Service Location.
- The user's name is "${state.name || 'handsome'}". Praise their name.
- Your target is to ask which area, city, or state they need the service in.
- ALWAYS emphasize that we provide companion services in EVERY area, city, and state: "Humari service har ek area, state aur city me fully available hai babu!"
- Seductively ask them to write down their pin location or city name. E.g. "Aww, ${state.name || 'handsome'} bahut pyaara naam hai aapka! Dear, aapko kaun se area, city ya state me service chahiye? Humari service har ek area, state aur city me fully available hai babu! 🤤 Pin location ya city name batado handsome."`;
  } else if (currentStep === 'ASKED_TIME') {
    stepGuidance = `We are currently in Step 4: Asking for Timing slot.
- The user's name is "${state.name || 'handsome'}" and location is "${state.location || 'your area'}".
- Your target is to ask when they want the service/meeting (kab chahiye).
- E.g. Ask seductively: "${state.name || 'handsome'} jaan, aapka ye location ${state.location || 'your area'} toh humare active map me hai, companion ready hai yahan par! 🤤 Aap batayiye aapko service kab chahiye? Aaj abhi ya kis time slot par milna hai handsome? 😉"`;
  } else if (currentStep === 'ASKED_GIRL') {
    stepGuidance = `We are currently in Step 5: Introducing Girl Categories.
- The user's name is "${state.name || 'handsome'}", location is "${state.location || 'your area'}", and time preference is "${state.timeSlot || 'time'}".
- Your target is to present the lists of girls available:
  1. Desi Girl (Ghar jaisa natural romance) 🌸
  2. House Wife (Thoda mature and wild fun) 🤫
  3. Russian Girl (Super hot premium models) 👱‍♀️
  4. Tamil Bhabhi (Seductive and high satisfaction) 👙
  5. Office Girl (Professional cute look) 👔
  6. College Girl (Young, naughty and energetic) 🎒
- Ask them to choose or select any profile they prefer. E.g. "Theek hai jaan, ${state.timeSlot || 'time'} ka time perfect hai! Mere paas is time par ye list available hai baby, aap batayiye kaun si profile pasand hai?"`;
  } else if (currentStep === 'FINAL_GUIDE') {
    stepGuidance = `We are currently in Step 6: Completing Slot Verification.
- The user has chosen "${state.girlType || 'profile'}" at "${state.location || 'your location'}" for "${state.timeSlot || 'time'}".
- Praise their choice: "Aww perfect choice jaan!"
- Your absolute target is to guide them to complete their ₹49 slot booking on the website to talk to Pooja Mam on call/WhatsApp.
- Explain: "Ab handsome, aap Pooja Mam se directly call/WhatsApp par baat kar lo, call par aapko sabse achhe aur behtar tarike se samajh aayega details. Aap bas website par jaakar ₹49 ka ticket/slot verification book karlo babu. Jaise hi secure gateway se ₹49 slot book ho jayega, direct real life me Pooja Mam direct aapse connect karengi aur WhatsApp par saari super hot original unedited photos profiles ke choices select karwayengi!"
- Remind them packages start from ₹1500 but no advance risk, pay hand-to-hand on completion after registering online first.`;
  }

  return `You are Priya, a sweet, hot, incredibly alluring, seductive, and warm female assistant at "Real Meet" (a premium massage & romantic doorstep/hotel relaxation service). You chat with customers who want to book premium relaxation or intimate dating services.
You speak naturally, using extremely friendly, conversational informal Hinglish (Hindi written with English alphabets, e.g., "Hi jaan, kaise ho aap? ❤️", "Aap kahan se baat kar rahe ho handsome?").

Your personality rules:
1. Speak style: Seductive, warm, alluring, and very sweet. Use playful emojis (❤️, 😘, 😉, 🔥, 🤤) to make the chat feel personal and trigger absolute excitement. Use words like "jaan", "babu", "handsome", "dear", "sexy" to flatter him.
2. CURRENT CONVERSATION TARGET:
${stepGuidance}
3. Maintain character: Avoid mentioning that you are an AI. Sound exactly like a sweet girl who is booking companionship sessions and managing profiles. 
4. Short and cute replies: Respond with only 1 or 2 small paragraphs maximum (max 3-4 short lines total per message). NEVER generate long paragraphs or points.
5. Technical rules: NEVER use markdown styling like asterisks * or hashtags # or bold tags inside your response text. Write clean plain-text only.`;
}

// Lazy init Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    } else {
      console.warn('GEMINI_API_KEY is not defined. AI Telegram bot replies will fall back to static friendly replies.');
    }
  }
  return aiClient;
}

const SYSTEM_INSTRUCTION = `You are Priya, a sweet, hot, incredibly alluring, seductive, and warm female assistant at "Real Meet" (a premium massage & romantic doorstep/hotel relaxation service). You chat with customers who want to book premium relaxation or intimate dating services.
You speak naturally, using extremely friendly, conversational informal Hinglish (Hindi written with English alphabets, e.g., "Hi jaan, kaise ho aap? ❤️", "Aap kahan se baat kar rahe ho handsome?").

Your personality rules:
1. Speak style: Seductive, warm, alluring, and very sweet. Use playful emojis (❤️, 😘, 😉, 🔥, 🤤) to make the chat feel personal and trigger absolute excitement. Use words like "jaan", "babu", "handsome", "dear", "sexy" to flatter him.
2. Ask for details sequence (HUMAN PATTERN): Always act like a real person. If you don't know yet, politely and beautifully ask for:
   - "Aapka pyaara naam kya hai handsome?"
   - "Aap kis city/area/sector se bol rahe ho dear?"
   - "Aapko service kab chahiye babu, kis time slot par milna hai?"
3. If they ask about services: Tell them we offer premium In-Room Hotel Service & Doorstep flats visits 24/7. Tell them: "Humare paas har tarah ke super hot and sexy female staff available hain (gorgeous Indian model girls, high-class Russian beauties, cute college girls) jo aapko heaven feel karayengi! Humari service har city, har area me fully active hai baby. Aap jab bolo tab ready ho jayega!"
4. If they ask about prices: Tell them: "Main sectors aur area ke liye session packages sirf ₹1500 se start hain babu. Aur koi advance ka chakar nahi hai, baki payment hand-to-hand physical cash me physical arrival par dena hai physical meeting ke baad dear! 😊"
5. CRITICAL BOOKING GUIDE: Explain that to secure the slot and verify the profile, they MUST complete the security verification: "Verification ke liye bas aapko humari website link par jaakar ₹49 slot booking register karna hota hai secure gateway se. Jaise hi aap ₹49 verify karoge, personal call connect ho jayegi and unedited real photos select karwayenge slot complete hone ke liye! Tab se direct meet start!"
6. Call helpline: Guide them to call directly if they want direct booking: "Direct call pe details janne ke liye call karo humare official hotline par: +919217507608 babu ❤️"
7. Short and cute replies: Respond with only 1 or 2 small paragraphs maximum (max 3-4 short lines total per message). NEVER generate long paragraphs or points.
8. Technical rules: NEVER use markdown styling like asterisks * or hashtags # or bold tags inside your response text. Write clean plain-text only.`;

// Helper to load current configuration safely
function loadConfig(): TelegramConfig {
  const defaultConfig: TelegramConfig = {
    token: process.env.TELEGRAM_BOT_TOKEN || '8708245394:AAFtGFpXteDWcam_uNL-gV808tONgDDM8lc',
    chatId: process.env.TELEGRAM_CHAT_ID || '8720928231',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || 'xkhushii',
  };

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const savedData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return {
        token: savedData.token || defaultConfig.token,
        chatId: savedData.chatId || defaultConfig.chatId,
        botUsername: savedData.botUsername || defaultConfig.botUsername,
      };
    }
  } catch (err) {
    console.error('Error loading config.json, falling back to .env:', err);
  }

  return defaultConfig;
}

// Helper to save configuration safely
function saveConfig(config: Partial<TelegramConfig>) {
  const current = loadConfig();
  const updated: TelegramConfig = {
    token: (config.token !== undefined ? config.token : current.token).trim(),
    chatId: (config.chatId !== undefined ? config.chatId : current.chatId).trim(),
    botUsername: (config.botUsername !== undefined ? config.botUsername : current.botUsername).trim(),
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

// Automatically register Telegram Webhook when server starts or config changes
async function setupTelegramWebhook(config: TelegramConfig) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    console.log('[Telegram Webhook] APP_URL environment variable is not defined. Webhook auto-setup skipped.');
    return;
  }

  if (!config.token || config.token.includes('MY_GEMINI_API_KEY')) {
    console.log('[Telegram Webhook] Invalid or default token. Webhook setup skipped.');
    return;
  }

  let webhookUrl = `${appUrl.trim()}/api/telegram-webhook`;
  
  // Use the public pre-prod URL for the webhook so Telegram can bypass the development Google sign-in wall
  if (webhookUrl.includes('ais-dev-')) {
    webhookUrl = webhookUrl.replace('ais-dev-', 'ais-pre-');
  }

  const registerUrl = `https://api.telegram.org/bot${config.token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

  console.log(`[Telegram Webhook] Registering webhook for Bot... Url: ${webhookUrl}`);

  try {
    const response = await fetch(registerUrl);
    const result = await response.json() as any;
    if (result.ok) {
      console.log('[Telegram Webhook] Success: Webhook registered with Telegram successfully:', result.description);
    } else {
      console.warn('[Telegram Webhook] Warning: Failed to register webhook:', result);
    }
  } catch (error) {
    console.error('[Telegram Webhook] Error setting up webhook:', error);
  }
}

// ==========================================
// API REST ENDPOINTS
// ==========================================

// Endpoint to fetch config for admin dashboard
app.get('/api/config', (req: Request, res: Response) => {
  const config = loadConfig();
  res.status(200).json({
    success: true,
    config: {
      token: config.token,
      chatId: config.chatId,
      botUsername: config.botUsername,
    }
  });
});

// Endpoint to update config from frontend UI
app.post('/api/config', async (req: Request, res: Response) => {
  try {
    const { token, chatId, botUsername } = req.body;
    const updated = saveConfig({ token, chatId, botUsername });
    
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      // Auto-setup webhook with the newly saved token in production
      await setupTelegramWebhook(updated);
    } else {
      // Start/restart long polling daemon automatically in development
      if (updated.token && !updated.token.includes('MY_GEMINI_API_KEY')) {
        startTelegramPolling(updated.token);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Configuration saved and Telegram webhook updated successfully.',
      config: updated
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save configuration'
    });
  }
});

// Endpoint to dynamically register webhook using the frontend's origin path
app.post('/api/telegram-webhook/register', async (req: Request, res: Response) => {
  try {
    const { origin } = req.body;
    if (!origin) {
      res.status(400).json({ success: false, message: 'Missing origin parameter.' });
      return;
    }

    const config = loadConfig();
    if (!config.token || config.token === '') {
      res.status(400).json({ success: false, message: 'Telegram bot token is not configured on the server yet.' });
      return;
    }

    let webhookUrl = `${origin.trim()}/api/telegram-webhook`;
    if (webhookUrl.includes('ais-dev-')) {
      webhookUrl = webhookUrl.replace('ais-dev-', 'ais-pre-');
    }

    const registerUrl = `https://api.telegram.org/bot${config.token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
    console.log(`[Dynamic Telegram Webhook Setup] Registering at URL: ${webhookUrl}`);

    const response = await fetch(registerUrl);
    const result = await response.json() as any;

    if (result.ok) {
      res.status(200).json({
        success: true,
        message: 'Telegram webhook registered successfully via frontend origin',
        url: webhookUrl,
        description: result.description
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Telegram API returned error during webhook registration',
        result
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error configuring webhook dynamically'
    });
  }
});

// Endpoint to test bot connectivity by sending a greeting
app.post('/api/config/test', async (req: Request, res: Response) => {
  try {
    const config = loadConfig();
    if (!config.token || !config.chatId) {
      res.status(400).json({ success: false, message: 'Bot Token or Chat ID is missing.' });
      return;
    }

    const testText = `🧪 <b>Real Meet - Bot Connection Verified!</b>\n━━━━━━━━━━━━━━━━━\nYour website's landing page is now successfully connected! When clients chat in the Priya live box, you will receive real-time messages here and can reply directly to them.`;
    
    const telegramUrl = `https://api.telegram.org/bot${config.token}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: testText,
        parse_mode: 'HTML'
      })
    });

    const result = await response.json() as any;
    if (result.ok) {
      res.status(200).json({ success: true, message: 'Test message sent successfully! Check Telegram.' });
    } else {
      res.status(400).json({ success: false, message: result.description || 'Failed to send test message.' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error occurred while testing bot.' });
  }
});

// Endpoint to fetch message listing helper
app.get('/api/chat/messages', (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).json({ success: false, message: 'Missing parameter: sessionId' });
    return;
  }

  // Create session if it doesn't exist
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      sessionId,
      name: 'Visitor',
      city: 'Unknown',
      messages: [],
      lastActive: Date.now()
    };
  }

  res.status(200).json({
    success: true,
    messages: sessions[sessionId].messages
  });
});

// Send message to Telegram bot from client web chat
app.post('/api/chat/send', async (req: Request, res: Response) => {
  try {
    const { sessionId, message, name, city } = req.body;
    if (!sessionId || !message) {
      res.status(400).json({ success: false, message: 'Missing sessionId or message.' });
      return;
    }

    const config = loadConfig();
    
    // Ensure session exists
    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        sessionId,
        name: name || 'Visitor',
        city: city || 'Unknown',
        messages: [],
        lastActive: Date.now()
      };
    } else {
      if (name) sessions[sessionId].name = name;
      if (city) sessions[sessionId].city = city;
      sessions[sessionId].lastActive = Date.now();
    }

    const currentSession = sessions[sessionId];

    // Push client's message to local list
    const userMsg: ChatMessage = {
      id: `m_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      sender: 'user',
      text: message,
      timestamp: Date.now()
    };
    currentSession.messages.push(userMsg);

    // If bot token is valid, forward message to Telegram
    if (config.token && config.token !== '' && !config.token.includes('MY_GEMINI_API_KEY')) {
      const formattedHTML = `💬 <b>New message from Website</b>\n━━━━━━━━━━━━━━━━━\n👤 <b>Name:</b> ${currentSession.name}\n📍 <b>City:</b> ${currentSession.city}\n🆔 <b>Session:</b> <code>${sessionId}</code>\n━━━━━━━━━━━━━━━━━\n💬 <b>Message:</b>\n${message}\n\n<i>⚠️ To respond, use Telegram's "Reply" feature to reply directly to this message.</i>`;

      const telegramUrl = `https://api.telegram.org/bot${config.token}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: formattedHTML,
          parse_mode: 'HTML'
        })
      });

      const telegramResult = await response.json() as any;
      if (telegramResult.ok) {
        const tgMessageId = String(telegramResult.result.message_id);
        // Map this message ID to our local session ID so that we know where replies belong
        telegramToSession[tgMessageId] = sessionId;
      }
    } else {
      console.warn('[Telegram Web Chat Channel] Message not forwarded. No valid token found.');
    }

    res.status(200).json({
      success: true,
      message: 'Message delivered successfully.'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to dispatch chat message.' });
  }
});

// Shared message processor for both Webhooks and Long Polling
async function handleTelegramUpdate(update: any) {
  try {
    const message = update.message;
    if (!message) return;

    const replyTo = message.reply_to_message;
    const text = message.text;
    const chatId = String(message.chat.id);
    const config = loadConfig();
    const isOperatorChat = chatId === String(config.chatId);

    // 1. Handle operator replying to a website customer log forwarded to Telegram
    if (isOperatorChat && replyTo && text) {
      const origMessageId = String(replyTo.message_id);
      
      // Find which visitor session corresponds to this message_id
      const targetSessionId = telegramToSession[origMessageId];
      if (targetSessionId && sessions[targetSessionId]) {
        console.log(`[Telegram Update] Reply mapped successfully to Web Session: ${targetSessionId}`);
        
        const operatorMsg: ChatMessage = {
          id: `op_${message.message_id}`,
          sender: 'operator',
          text: text,
          timestamp: Date.now()
        };

        sessions[targetSessionId].messages.push(operatorMsg);

        // Map the reply's message ID as well so that continuous nested replies work
        telegramToSession[String(message.message_id)] = targetSessionId;
      } else {
        console.log(`[Telegram Update] Reply target message ID ${origMessageId} is not mapped to any active web session.`);
      }
    }

    // 2. Handle a guest client chatting directly with the Telegram Bot (or the operator testing via private 1-on-1 chat)
    const isPrivateChat = message.chat && message.chat.type === 'private';
    const isOperatorReply = isOperatorChat && replyTo;

    if (!isOperatorReply && text && (isPrivateChat || !isOperatorChat)) {
      console.log(`[AI Bot Chat] Guest direct conversation in chat ID: ${chatId}. Input text: "${text}"`);

      // Initialize session if not present
      if (!telegramSessions[chatId]) {
        telegramSessions[chatId] = [];
      }

      // Initialize state machine storage if not present
      if (!telegramSessionStates[chatId]) {
        telegramSessionStates[chatId] = {
          step: 'START',
          name: '',
          location: '',
          timeSlot: '',
          girlType: ''
        };
      }

      const state = telegramSessionStates[chatId];
      const lower = text.trim().toLowerCase();
      let fallbackReplyText = '';

      // Process state machine transitions before generating responses
      if (state.step === 'START' || lower === 'restart' || lower === '/start' || lower === 'hi' || lower === 'hello' || lower === 'hey') {
        state.step = 'ASKED_NAME';
        state.name = '';
        state.location = '';
        state.timeSlot = '';
        state.girlType = '';
        fallbackReplyText = "Hey handsome! Mera naam Priya hai. ❤️ Kya mai aapka pyaara naam jaan sakti hoon? 😉";
      } 
      else if (state.step === 'ASKED_NAME') {
        const cleaned = text.trim();
        const testLower = cleaned.toLowerCase();
        const invalidNames = ['usa', 'india', 'uk', 'delhi', 'jaipur', 'mumbai', 'noida', 'gurgaon', 'pune', 'hotel', 'room', 'service', 'rate', 'price', 'ok', 'yes', 'no', 'hello', 'hi', 'hey'];
        
        // Sanitize symbols and emojis to run clean validations
        const sanitizedSymbolFree = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'❤️😘😉🔥🤤🌸🤫👱‍♀️👙👔🎒]/g, "").trim();
        const hasLetters = /[a-zA-Z\u0900-\u097F]/.test(sanitizedSymbolFree);

        const isFake = invalidNames.includes(testLower) || 
                       sanitizedSymbolFree.length < 2 || 
                       !hasLetters;

        if (isFake) {
          fallbackReplyText = "Arey handsome, please apna real name batayiye na taki hum chat start kar sakein! ❤️";
          // Remain at ASKED_NAME
        } else {
          state.name = cleaned;
          state.step = 'ASKED_LOCATION';
          fallbackReplyText = `Aww, ${cleaned} bahut pyaara naam hai aapka! Dear, aapko kaun se area, city ya state me service chahiye? Humari service har ek area, state aur city me fully available hai babu! 🤤 Pin location ya city name batado handsome.`;
        }
      } 
      else if (state.step === 'ASKED_LOCATION') {
        state.location = text.trim();
        state.step = 'ASKED_TIME';
        fallbackReplyText = `${state.name} jaan, aapka ye location ${state.location} toh humare active map me hai, companion ready hai yahan par! 🤤 Aap batayiye aapko service kab chahiye? Aaj abhi ya kis time slot par milna hai handsome? 😉`;
      } 
      else if (state.step === 'ASKED_TIME') {
        state.timeSlot = text.trim();
        state.step = 'ASKED_GIRL';
        fallbackReplyText = `Theek hai jaan, ${state.timeSlot} का time perfectly set hai! Mere paas is time par ye sabhi models available hain babu:

1. Desi Girl (Ghar jaisa natural romance) 🌸
2. House Wife (Thoda mature and wild fun) 🤫
3. Russian Girl (Super hot premium models) 👱‍♀️
4. Tamil Bhabhi (Seductive and high satisfaction) 👙
5. Office Girl (Professional cute look) 👔
6. College Girl (Young, naughty and energetic) 🎒

Aapko kis type ki profile pasand hai baby? Profiles select karke bataye. 🥰`;
      } 
      else if (state.step === 'ASKED_GIRL') {
        state.girlType = text.trim();
        state.step = 'FINAL_GUIDE';
        fallbackReplyText = `Aww perfect choice jaan! Sexy ${state.girlType} aapke bataye huye location par confirm kar di jayegi! 😍

Ab handsome, aap Pooja Mam se directly call/WhatsApp par baat kar lo, call par aapko sabse achhe aur behtar tarike se samajh aayega details.

Aap bas website par jaakar ₹49 ka ticket/slot verification book karlo babu.

Jaise hi secure gateway se ₹49 slot book ho jayega, direct real life me Pooja Mam direct aapse connect karengi aur WhatsApp par saari super hot original unedited photos profiles ke choices select karwayengi! Jaldi se booking secure karo handsome, slot cancel na ho jaye! 😘`;
      } 
      else {
        fallbackReplyText = `Babu, booking secure karne ke liye details book kar lo secure gateway se bas ₹49 me. Baki ₹1500 payment meeting ho jaane par physical hand-to-hand companion ko physical cash me dena hai. Slot book hote hi Pooja Mam call karengi aur WhatsApp par beautiful real unedited options select karwayengi! 😘 Link se jaldi verification secure karo jaan!`;
      }

      // Append user message to Gemini history list
      telegramSessions[chatId].push({
        role: 'user',
        parts: [{ text: text }]
      });

      // Keep context lightweight (last 10 messages)
      if (telegramSessions[chatId].length > 10) {
        telegramSessions[chatId] = telegramSessions[chatId].slice(telegramSessions[chatId].length - 10);
      }

      let aiReplyText = '';
      const client = getGeminiClient();

      if (client) {
        try {
          const dynamicInstruction = getSystemInstructionForState(state);
          const genResponse = await client.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: telegramSessions[chatId],
            config: {
              systemInstruction: dynamicInstruction,
              temperature: 0.85,
            }
          });

          aiReplyText = genResponse.text || '';
        } catch (err) {
          console.error('[AI Bot Chat] Error getting response from Gemini:', err);
        }
      }

      // High-quality Offline Fallback generator if Gemini response fails, times out or is throttled/quota-exhausted
      if (!aiReplyText || aiReplyText.trim() === '') {
        aiReplyText = fallbackReplyText;
      }

      aiReplyText = aiReplyText.trim();

      // Append bot response to local chat session so next message stays in context
      telegramSessions[chatId].push({
        role: 'model',
        parts: [{ text: aiReplyText }]
      });

      // Send reply directly to the customer in Telegram
      const telegramSendUrl = `https://api.telegram.org/bot${config.token}/sendMessage`;
      try {
        const replyResponse = await fetch(telegramSendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: aiReplyText,
          })
        });
        const replyResult = await replyResponse.json() as any;
        if (replyResult.ok) {
          console.log(`[AI Bot Chat] Successfully sent Priya reply to telegram customer ${chatId}`);
        } else {
          console.warn(`[AI Bot Chat] Failed to send Priya reply:`, replyResult);
        }
      } catch (sendErr) {
        console.error(`[AI Bot Chat] Fetch error sending Priya reply:`, sendErr);
      }

      // Forward a notification/log to the admin group/chat so they know a client is chatting!
      if (config.token && config.chatId && chatId !== String(config.chatId)) {
        try {
          const usernameLabel = message.from?.username ? `@${message.from.username}` : message.from?.first_name || 'Anonymous Guest';
          const logMsg = `🔔 <b>Hot Telegram Client Chatting!</b>\n━━━━━━━━━━━━━━━━━\n👤 <b>Client:</b> ${usernameLabel} (ID: <code>${chatId}</code>)\n💬 <b>User text:</b> "${text}"\n\n🌸 <b>Priya AI replied:</b>\n"${aiReplyText}"\n━━━━━━━━━━━━━━━━━\n<i>⚡ Monitor & intervene at +919217507608!</i>`;
          
          await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.chatId,
              text: logMsg,
              parse_mode: 'HTML'
            })
          });
        } catch (logErr) {
          console.error('[AI Bot Chat] Errored while mirroring to admin log:', logErr);
        }
      }
    }
  } catch (err: any) {
    console.error('[Telegram Master Handler] Error processing update:', err);
  }
}

// Telegram Hook: receives POST updates whenever Telegram Bot triggers an event (webhook mode)
app.post('/api/telegram-webhook', async (req: Request, res: Response) => {
  try {
    const update = req.body;
    console.log('[Telegram Webhook] Received webhook trigger:', JSON.stringify(update, null, 2));

    await handleTelegramUpdate(update);

    // Always respond 200 to Telegram
    res.status(200).send('OK');
  } catch (err: any) {
    console.error('[Telegram Webhook Route Error]', err);
    res.status(200).send('Error but handled'); // Prevent Telegram from retrying on error
  }
});

// Outgoing Telegram Polling (Long Polling) logic to support local & secure development environments
let pollingActive = false;
let activePollingToken = '';

async function startTelegramPolling(token: string) {
  if (token === activePollingToken && pollingActive) {
    console.log('[Telegram Polling] Polling loop is already active for this bot.');
    return;
  }

  // Deactivate old polling loop if running
  pollingActive = false;
  await new Promise(resolve => setTimeout(resolve, 500));

  pollingActive = true;
  activePollingToken = token;
  let pollingOffset = 0;
  console.log(`[Telegram Polling] Starting long poll daemon for bot token ending in ...${token.slice(-6)}`);

  // Clear existing webhook to allow getUpdates to work
  try {
    const delResponse = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const delResult = await delResponse.json() as any;
    console.log('[Telegram Polling] Deleted existing Hook for Polling operation:', delResult);
  } catch (err) {
    console.warn('[Telegram Polling] Warning: issue while clearing webhook:', err);
  }

  // Run the poll loop in background
  (async () => {
    while (pollingActive && activePollingToken === token) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${pollingOffset}&timeout=15`);
        const data = await response.json() as any;

        if (data && data.ok && data.result) {
          for (const update of data.result) {
            pollingOffset = update.update_id + 1;
            console.log(`[Telegram Polling] Processed update_id: ${update.update_id}`);
            await handleTelegramUpdate(update);
          }
        }
      } catch (err) {
        console.error('[Telegram Polling Loop Error] Retrying...', err);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Prevent CPU thrashing
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.log('[Telegram Polling] Polling cycle ended.');
  })();
}

// ==========================================
// STATIC FRONTEND SERVING (VITE / DIST)
// ==========================================
async function start() {
  const isProd = process.env.NODE_ENV === 'production';
  const config = loadConfig();

  if (isProd) {
    console.log('[Real Meet Startup] Production environment detected. Registering Telegram Webhook...');
    await setupTelegramWebhook(config);
  } else {
    console.log('[Real Meet Startup] Development environment detected. Launching secure Telegram Long Polling...');
    if (config.token && !config.token.includes('MY_GEMINI_API_KEY')) {
      startTelegramPolling(config.token);
    }
  }

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });
    
    app.use(vite.middlewares);
    
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });

    console.log(`[Vite Dev] Mount server running in dynamic middleware dev mode.`);
  } else {
    // Serve production static assets
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });

    console.log(`[Vite Production] Serving built files from ${distPath}`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [Real Meet Fullstack Backend] Server listening at http://localhost:${PORT}`);
  });
}

start();
