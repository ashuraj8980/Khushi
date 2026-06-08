import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  MessageSquare,
  CheckCircle2,
  X,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Settings,
  Loader2,
  ShieldCheck,
  ArrowUpRight,
  Sparkles,
  Lock,
  Heart
} from 'lucide-react';

interface TelegramConfig {
  token: string;
  chatId: string;
  botUsername: string;
}

export default function App() {
  // Navigation & Screen States
  const [hasPaid, setHasPaid] = useState<boolean>(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState<boolean>(false);
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<'call' | 'whatsapp' | 'telegram' | null>(null);

  // Bot Credentials Config State
  const [configModalOpen, setConfigModalOpen] = useState<boolean>(false);
  const [botConfig, setBotConfig] = useState<TelegramConfig>({
    token: '',
    chatId: '',
    botUsername: 'xkhushii'
  });
  const [configSaveStatus, setConfigSaveStatus] = useState<string>('');
  const [testSending, setTestSending] = useState<boolean>(false);
  const [testMessage, setTestMessage] = useState<string>('');

  // Video State management
  const [videoPlaying, setVideoPlaying] = useState<boolean>(false);
  const [videoMuted, setVideoMuted] = useState<boolean>(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Constants
  const WHATSAPP_NUMBER = '919217507608';
  const PRIMARY_TELEGRAM = 'xkhushii';

  // 1. Initial State Loading
  useEffect(() => {
    // Check if client already paid
    const paid = localStorage.getItem('rm_paid_v1') === 'yes';
    if (paid) {
      setHasPaid(true);
    }

    // Load actual initial bot configurations from API
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.config) {
          setBotConfig(data.config);

          // Automatically establish/renew Telegram Webhook using current origin
          fetch('/api/telegram-webhook/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: window.location.origin })
          })
          .then(r => r.json())
          .then(regData => console.log('Dynamic Webhook Setup:', regData))
          .catch(err => console.error('Auto webhook setup error:', err));
        }
      })
      .catch(err => console.error('Error fetching Telegram config on init:', err));
  }, []);

  // Post booking helper to log clicked button actions in Telegram for real-time tracking
  const sendLeadLog = (actionName: string) => {
    const payload = {
      sessionId: localStorage.getItem('rm_session_id') || 'unregistered',
      message: `User clicked [${actionName}] button on main page`,
      name: 'Visitor Target',
      city: 'Detected from Session'
    };

    fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => console.log('Lead trace bypassed:', err));
  };

  // Convert callback handler to support standard link redirect after pay
  const triggerSuccess = () => {
    localStorage.setItem('rm_paid_v1', 'yes');
    setHasPaid(true);
    setPaymentModalOpen(false);

    // Send analytics purchase event
    try {
      (window as any).fbq?.('track', 'Purchase', { value: 49, currency: 'INR', content_name: 'Real Meet Access' });
    } catch (e) {}

    // Track lead payout on telegram
    sendLeadLog('Success Payout ₹49');

    // Trigger redirection based on target pending intent
    if (pendingAction === 'whatsapp') {
      const msg = `Hi Pooja Mam! Maine ₹49 verification pay kar diya hai ✅ Direct photos aur details connect kariye.`;
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    } else if (pendingAction === 'telegram') {
      window.open(`https://t.me/${botConfig.botUsername || PRIMARY_TELEGRAM}`, '_blank');
    } else {
      window.open(`tel:+919217507608`, '_self');
    }
  };

  // Trigger Razorpay payment flows
  const handlePayNow = () => {
    setPaymentLoading(true);

    if (!(window as any).Razorpay) {
      alert('Razorpay payment gateway script not loaded. Please verify your internet connection.');
      setPaymentLoading(false);
      return;
    }

    const options = {
      key: 'rzp_live_SsM9fK1UOQZsBB', // Pre-configured live key ID
      amount: 4900, // ₹49.00
      currency: "INR",
      name: "Real Meet Access",
      description: "Discreet Consultation One-Time Access Fee",
      prefill: {
        name: "Premium Guest",
        email: "client@realmeet.co.in",
        contact: "9100000000"
      },
      handler: function(response: any) {
        triggerSuccess();
      },
      modal: {
        ondismiss: function() {
          setPaymentLoading(false);
        }
      },
      theme: { color: "#e91e8c" },
      method: { upi: true, card: true, netbanking: false, wallet: false, emi: false }
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
    rzp.on('payment.failed', function(response: any) {
      alert('Payment failed. Please retry.');
      setPaymentLoading(false);
    });
  };

  // Interaction handlers
  const handleTelegramClick = () => {
    sendLeadLog('Telegram Redirect Clicked');
    // Open Telegram directly in a new window
    window.open(`https://t.me/${botConfig.botUsername || PRIMARY_TELEGRAM}`, '_blank');
  };

  const handleWhatsAppRedirect = () => {
    setPendingAction('whatsapp');
    setPaymentModalOpen(true);
  };

  const handleCallRedirect = () => {
    setPendingAction('call');
    setPaymentModalOpen(true);
  };

  // Video controller methods
  const togglePlayVideo = () => {
    if (!videoRef.current) return;
    if (videoPlaying) {
      videoRef.current.pause();
      setVideoPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setVideoPlaying(true);
        setVideoMuted(false);
        if (videoRef.current) videoRef.current.muted = false;
      }).catch(err => {
        console.warn('Autoplay blocked. Retrying with mute:', err);
        videoRef.current!.muted = true;
        videoRef.current!.play();
        setVideoPlaying(true);
        setVideoMuted(true);
      });
    }
  };

  const toggleMuteVideo = () => {
    if (!videoRef.current) return;
    const isMuted = !videoMuted;
    videoRef.current.muted = isMuted;
    setVideoMuted(isMuted);
  };

  // Save changes to Bot Config
  const handleSaveBotConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaveStatus('saving');

    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(botConfig)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setConfigSaveStatus('success');
          setTimeout(() => setConfigSaveStatus(''), 4000);
        } else {
          setConfigSaveStatus('error');
        }
      })
      .catch(err => {
        console.error('Error saving config:', err);
        setConfigSaveStatus('error');
      });
  };

  // Send test validation message
  const handleTestBotConnection = () => {
    setTestSending(true);
    setTestMessage('');

    fetch('/api/config/test', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setTestSending(false);
        if (data.success) {
          setTestMessage('success');
        } else {
          setTestMessage(data.message || 'Error sending test message.');
        }
        setTimeout(() => setTestMessage(''), 8000);
      })
      .catch(err => {
        setTestSending(false);
        setTestMessage('Connection request failed. Confirm node server is active.');
      });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white text-slate-900 font-sans antialiased">
      {/* Pristine Light Soft Glow Background Accents (White + Pink + Blue theme) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-gradient-to-b from-pink-50/40 via-white to-blue-50/30">
        <div className="absolute top-[-150px] right-[-100px] w-96 h-96 rounded-full blur-[100px] bg-pink-100/60 animate-[pulse_10s_infinite]"></div>
        <div className="absolute bottom-[200px] left-[-100px] w-80 h-80 rounded-full blur-[100px] bg-sky-100/50 animate-[pulse_12s_infinite]"></div>
      </div>

      {/* 1. STICKY HEADER */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-4 bg-white/90 backdrop-blur-xl border-b border-pink-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-xl font-bold font-serif tracking-tight text-slate-950">
            Real <span className="italic text-pink-600 font-semibold">Meet</span>
          </div>
          {/* Quick link indicator for Admin Bot Panel */}
          <button 
            id="adminSetupTrigger"
            onClick={() => setConfigModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.68rem] bg-pink-50 border border-pink-200/50 text-pink-600 hover:bg-pink-100 transition cursor-pointer font-medium"
            title="Setup Custom Telegram Bot"
          >
            <Settings size={12} className="animate-[spin_8s_linear_infinite]" />
            <span>Connect Bot</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {videoPlaying && (
            <button 
              id="headerMuteToggle"
              onClick={toggleMuteVideo} 
              className="p-2 rounded-full bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer"
            >
              {videoMuted ? <VolumeX size={14} /> : <Volume2 size={14} className="text-pink-600" />}
            </button>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-50 border border-pink-100 text-[0.68rem] font-bold uppercase tracking-wider text-pink-600">
            <span className="w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_6px_#e91e8c] animate-pulse"></span>
            <span>Live Bookings Active</span>
          </div>
        </div>
      </header>

      {/* 2. SUCCESS PAGE SCREEN LAYER */}
      {hasPaid ? (
        <div id="successScreen" className="relative z-10 max-w-lg mx-auto px-6 py-16 text-center animate-[fadeIn_0.5s_ease_both]">
          <div className="w-20 h-20 rounded-full bg-green-50 border-4 border-green-150 flex items-center justify-center text-green-600 text-4xl shadow-lg shadow-green-100 mx-auto mb-8 animate-bounce">
            ✓
          </div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-slate-950 mb-3">
            Payment <span className="font-normal italic text-pink-600 bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Done!</span>
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto mb-8">
            Thank you! Aapka access fee registration ho chuka hai. Pooja Mam se connect karne ke liye niche direct options par click karein. Profiles list WhatsApp aur Telegram pe bheji ja rahi hai.
          </p>

          <div className="p-6 rounded-2xl bg-gradient-to-br from-pink-500/5 via-white to-sky-500/5 border border-pink-200/40 mb-8 shadow-md">
            <div className="text-[0.68rem] font-bold text-pink-600 uppercase tracking-widest mb-1.5">Direct Call Booking Line</div>
            <div className="font-serif text-2xl font-bold tracking-wide text-slate-900 mb-1">+91 92175 07608</div>
            <div className="text-[0.68rem] text-slate-500">Call anytime &middot; Discreet 24/7 Access Verified</div>
          </div>

          <div className="flex flex-col gap-3.5 z-10">
            <a 
              id="successCallBtn"
              href="tel:+919217507608" 
              className="flex items-center justify-center gap-2.5 w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold shadow-lg shadow-emerald-500/15 transition transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98"
            >
              <Phone size={18} />
              <span>Call Now — +91 92175 07608</span>
            </a>

            <a 
              id="successWaBtn"
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('*REAL MEET CONFIRMED* - Payment Success Verified! Please send available Russian / Indian staff photo selection.')}`} 
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 w-full py-4 rounded-xl bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-semibold shadow-lg shadow-green-500/15 transition transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98"
            >
              <MessageSquare size={18} />
              <span>WhatsApp Connect — Fast Booking</span>
            </a>

            <button 
              id="successTgBtn"
              onClick={handleTelegramClick}
              className="flex items-center justify-center gap-2.5 w-full py-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-indigo-500/15 transition transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              <span>Verify via Telegram Chat Bot</span>
            </button>
          </div>

          <button 
            id="successResetBtn"
            onClick={() => {
              localStorage.removeItem('rm_paid_v1');
              setHasPaid(false);
            }}
            className="mt-12 text-xs text-slate-400 hover:text-slate-600 underline transition cursor-pointer"
          >
            Show full home services screen
          </button>
        </div>
      ) : (
        <>
          {/* 3. HERO VIDEO CONTAINER AREA */}
          <section id="heroVideoSection" className="relative z-10 w-full bg-slate-100 border-b border-pink-100/30">
            <div className="relative w-full max-w-4xl mx-auto overflow-hidden aspect-[16/9] md:aspect-[2.35/1] bg-slate-900 md:rounded-2xl md:my-5 md:shadow-lg shadow-pink-100">
              <video 
                ref={videoRef}
                loop 
                playsInline 
                preload="auto" 
                muted={videoMuted}
                onClick={togglePlayVideo}
                className="w-full h-full object-cover cursor-pointer block"
              >
                <source src="https://assets.mixkit.co/videos/preview/mixkit-beautiful-young-woman-with-eyes-closed-during-massage-40742-large.mp4" type="video/mp4" />
                <source src="video1.mp4" type="video/mp4" />
              </video>
              
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-black/20 pointer-events-none"></div>

              {/* VIDEO MIDDLE PLAY BUTTON OVERLAY */}
              {!videoPlaying && (
                <div 
                  id="videoPlayOverlay"
                  onClick={togglePlayVideo}
                  className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer bg-slate-950/30 hover:bg-slate-950/20 transition-all duration-300 z-10"
                >
                  <div className="relative flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-pink-600 text-white shadow-[0_0_20px_rgba(233,30,140,0.4)] transition hover:scale-108 active:scale-95 duration-200">
                    <span className="absolute inset-0 rounded-full border border-pink-300 animate-ping opacity-60"></span>
                    <Play size={26} className="ml-1 fill-white text-white" />
                  </div>
                  
                  <div className="mt-4 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md border border-white/10 px-4 py-1.5 rounded-full text-[0.68rem] font-bold tracking-wider text-pink-200 uppercase">
                    <span>🔊 Tap to play with Sound</span>
                  </div>
                </div>
              )}

              {/* Lower info label to verify video is alive */}
              {videoPlaying && (
                <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full bg-pink-600 text-white font-semibold text-[0.68rem] tracking-wider uppercase backdrop-filter backdrop-blur-md">
                  <Play size={10} className="fill-white mr-1" />
                  <span>Real Meet — Services Video</span>
                </div>
              )}

              {/* CONTROL BUTTON LOWER RIGHT */}
              {videoPlaying && (
                <button 
                  id="videoPlayPauseCtrl"
                  onClick={togglePlayVideo}
                  className="absolute bottom-4 right-4 z-20 flex items-center justify-center w-9 h-9 rounded-full bg-black/60 hover:bg-black/75 border border-white/25 text-white backdrop-filter backdrop-blur-md transition cursor-pointer"
                  title="Pause Video"
                >
                  <Pause size={14} />
                </button>
              )}
            </div>
          </section>

          {/* 4. MAIN INTENSE HERO ACTION AREA */}
          <section id="heroSection" className="relative z-10 max-w-xl mx-auto px-6 py-10 text-center">
            <div className="inline-flex items-center gap-2.5 mb-5">
              <span className="w-5 h-[1.5px] bg-pink-500/25"></span>
              <span className="text-[0.60rem] tracking-[0.22em] font-semibold text-pink-600 uppercase">Premium &middot; Discreet &middot; 24/7 Service</span>
              <span className="w-5 h-[1.5px] bg-pink-500/25"></span>
            </div>

            <h1 className="font-serif text-5xl md:text-6xl font-normal leading-tight tracking-tight text-slate-950 mb-3 animate-[fadeIn_0.5s_ease_both]">
              Real <span className="italic font-normal text-pink-600 bg-gradient-to-r from-pink-600 via-pink-500 to-rose-600 bg-clip-text text-transparent">Meet</span>
            </h1>

            <p className="text-xs md:text-sm font-medium text-slate-500 tracking-wider uppercase mb-8 leading-relaxed">
              Premium Massage &amp; Doorstep Relaxation Services
            </p>

            <div className="flex flex-wrap justify-center gap-1.5 mb-10 max-w-sm md:max-w-md mx-auto">
              <span className="text-[0.68rem] font-bold tracking-wide uppercase px-3 py-1 rounded-full bg-pink-50 border border-pink-100 text-pink-600">Home Visit</span>
              <span className="text-[0.68rem] font-bold tracking-wide uppercase px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-sky-600">Hotel Service</span>
              <span className="text-[0.68rem] font-bold tracking-wide uppercase px-3 py-1 rounded-full bg-pink-50 border border-pink-100 text-pink-600">Indian &amp; Russian Selection</span>
              <span className="text-[0.68rem] font-bold tracking-wide uppercase px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-slate-600">Fully Discreet</span>
            </div>

            {/* CALL TO ACTION BUTTON BAR (White + Pink + Blue Theme) */}
            <div className="flex flex-col gap-3.5 max-w-sm mx-auto p-4 md:p-6 rounded-2xl bg-white border border-pink-50 shadow-lg shadow-pink-100/50">
              
              {/* BRAND DIRECT TELEGRAM CHATBOT ACCESS BUTTON */}
              <button 
                id="ctaTelegramBot"
                onClick={handleTelegramClick}
                className="flex items-center justify-center gap-3 w-full py-4 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 transition text-white text-sm font-bold shadow-md shadow-sky-500/20 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" className="animate-[pulse_1.5s_infinite]">
                  <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                <span>Book via Telegram Chatbot</span>
                <span className="text-[0.62rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white text-sky-600 animate-pulse">Bot Active</span>
              </button>

              <div className="flex items-center gap-2 justify-center my-1">
                <span className="w-10 h-[1px] bg-slate-200"></span>
                <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest">or other channels</span>
                <span className="w-10 h-[1px] bg-slate-200"></span>
              </div>

              {/* PRIMARY CONTACT BUTTON: Call */}
              <button 
                id="ctaCallTop"
                onClick={handleCallRedirect}
                className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-xs transition cursor-pointer"
              >
                <Phone size={15} />
                <span>Book via Call Consultation</span>
              </button>

              {/* SECONDARY CONTACT BUTTON: WhatsApp */}
              <button 
                id="ctaWaTop"
                onClick={handleWhatsAppRedirect}
                className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl border border-green-100 bg-green-50 text-green-700 hover:bg-green-100 font-semibold text-xs transition cursor-pointer"
              >
                <MessageSquare size={15} />
                <span>Book via WhatsApp Operator</span>
              </button>

              <div className="mt-2 text-[0.65rem] text-slate-400 font-medium">
                🔒 Private Chat &middot; Telegram Welcomes &middot; Secure &amp; Legit
              </div>
            </div>

            {/* TRUST STATISTICS GRID */}
            <div className="grid grid-cols-3 gap-[1px] max-w-sm mx-auto mt-10 bg-pink-100/60 border border-pink-100 rounded-xl overflow-hidden shadow-sm">
              <div className="py-3 bg-white">
                <span className="block text-xl font-serif font-bold text-pink-600">10K+</span>
                <span className="text-[0.58rem] font-bold uppercase tracking-wider text-slate-400">Happy Clients</span>
              </div>
              <div className="py-3 bg-white">
                <span className="block text-xl font-serif font-bold text-pink-600">24/7</span>
                <span className="text-[0.58rem] font-bold uppercase tracking-wider text-slate-400">Open Always</span>
              </div>
              <div className="py-3 bg-white">
                <span className="block text-xl font-serif font-bold text-pink-600">100%</span>
                <span className="text-[0.58rem] font-bold uppercase tracking-wider text-slate-400">Discreet</span>
              </div>
            </div>
          </section>

          {/* 5. PREMIUM OFFERINGS SECTIONS (White background + soft Pink and Blue elements) */}
          <section id="servicesSection" className="relative z-10 max-w-lg mx-auto px-6 py-10">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-5 h-[1.5px] bg-pink-500/35"></span>
              <span className="text-[0.62rem] uppercase tracking-wider font-extrabold text-pink-600">Our Premium Selection</span>
            </div>

            <h2 className="font-serif text-3xl text-slate-900 font-normal mb-6">
              Massage &amp; <span className="italic text-pink-600">Relaxation</span>
            </h2>

            <div className="flex flex-col gap-3">
              <div id="serviceCard1" className="flex gap-4.5 p-5 rounded-2xl bg-white border border-pink-100/50 shadow-sm transition hover:translate-y-[-2px] hover:border-pink-300">
                <span className="font-serif text-pink-500 italic text-sm font-bold">01</span>
                <div>
                  <h3 className="text-slate-900 text-sm font-bold mb-1">In-Room Hotel Service</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-normal">
                    Verified premium hotels and stays across Delhi, Jaipur, Surat and main metro sectors. Safest discreet relaxation for visiting businessmen.
                  </p>
                </div>
              </div>

              <div id="serviceCard2" className="flex gap-4.5 p-5 rounded-2xl bg-white border border-pink-100/50 shadow-sm transition hover:translate-y-[-2px] hover:border-pink-300">
                <span className="font-serif text-xs italic text-pink-500 font-bold">02</span>
                <div>
                  <h3 className="text-slate-900 text-sm font-bold mb-1">Doorstep Home Visits</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-normal">
                    Qualified therapists carrying hygienic equipment directly to your private flat, apartment or PG room. Calm, elite, tension-free massage.
                  </p>
                </div>
              </div>

              <div id="serviceCard3" className="flex gap-4.5 p-5 rounded-2xl bg-white border border-pink-100/50 shadow-sm transition hover:translate-y-[-2px] hover:border-pink-300">
                <span className="font-serif text-xs italic text-pink-500 font-bold">03</span>
                <div>
                  <h3 className="text-slate-900 text-sm font-bold mb-1">Elite Russian / Indian Staff</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-normal">
                    Fascinating collection of unedited verified profiles. Polish, mannered therapists between age groups 20 to 30 years old.
                  </p>
                </div>
              </div>

              <div id="serviceCard4" className="flex gap-4.5 p-5 rounded-2xl bg-white border border-pink-100/50 shadow-sm transition hover:translate-y-[-2px] hover:border-pink-300">
                <span className="font-serif text-xs italic text-pink-500 font-bold">04</span>
                <div>
                  <h3 className="text-slate-900 text-sm font-bold mb-1">No Real Advance Risk</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-normal">
                    Pay only ₹49 to verify and access Pooja Mam personally. Complete session balance payment occurs hand-to-hand in cash upon physical arrivals.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 6. TRUST AND SAFETY METRICS (Light gradient styling) */}
          <section id="safetySection" className="relative z-10 max-w-lg mx-auto px-6 py-6 flex flex-col gap-3">
            <div className="flex items-center gap-4.5 p-4 rounded-xl bg-pink-50/20 border border-pink-100/50">
              <div className="w-10 h-10 shrink-0 rounded-full bg-pink-100 border border-pink-200 flex items-center justify-center text-md shadow-sm">
                🛡️
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 mb-0.5">Absolute Identity Lock</h4>
                <p className="text-[0.68rem] text-slate-500 leading-normal">Website maintains no personal client files. Completely anonymous access guaranteed.</p>
              </div>
            </div>

            <div className="flex items-center gap-4.5 p-4 rounded-xl bg-sky-50/20 border border-sky-100/40">
              <div className="w-10 h-10 shrink-0 rounded-full bg-sky-100 border border-sky-200 flex items-center justify-center text-md shadow-sm">
                ⚡
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 mb-0.5">Instant Telegram Setup</h4>
                <p className="text-[0.68rem] text-slate-500 leading-normal">Our bot welcomes you and schedules verification instantly. Instant unedited photos share.</p>
              </div>
            </div>
          </section>

          {/* 7. BOTTOM STACK ACTIONS */}
          <section id="bottomCtaSection" className="relative z-10 max-w-lg mx-auto py-14 px-6 text-center border-t border-pink-100 bg-gradient-to-b from-white to-pink-50/30">
            <div className="w-[1px] h-10 bg-gradient-to-b from-pink-500 to-transparent mx-auto mb-5"></div>
            
            <h2 className="font-serif text-3xl font-normal text-slate-950 mb-3">
              Book Real <br />
              <span className="italic text-pink-600">Discreet Relaxation</span>
            </h2>
            
            <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto mb-8">
              Aapko direct Telegram chatbot par redirect kiya jaayega. Hamara robot welcome msg bhejega, aur mam call connect karwa ke profile selection and booking confirm karengi.
            </p>

            <div className="flex flex-col gap-3.5 max-w-sm mx-auto">
              {/* PRIMARY TELEGRAM BUTTON */}
              <button 
                id="ctaTelegramBotBottom"
                onClick={handleTelegramClick}
                className="flex items-center justify-center gap-3 w-full py-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-450 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/15 cursor-pointer transform hover:-translate-y-0.5 transition"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                <span>Book via Telegram Chat-bot</span>
              </button>

              {/* SECONDARY CALL ACTION */}
              <button 
                id="ctaCallBottom"
                onClick={handleCallRedirect}
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl border border-pink-100 bg-pink-50/50 hover:bg-pink-50 text-pink-600 font-bold text-xs transition cursor-pointer"
              >
                <Phone size={14} />
                <span>Book via Call Booking</span>
              </button>
            </div>
          </section>
        </>
      )}

      {/* FOOTER */}
      <footer className="relative z-10 text-center py-10 border-t border-slate-100 bg-slate-50 text-[0.62rem] text-slate-400 tracking-widest uppercase font-bold">
        <div>&copy; 2026 WellnessConnect &middot; Premium Service &middot; All Rights Reserved</div>
      </footer>


      {/* 8. RAZORPAY PAYMENT BASE MODAL (White Premium Light theme) */}
      {paymentModalOpen && (
        <div id="paymentModalContainer" className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-md animate-[fadeIn_0.2s_ease_both]">
          {/* Dismiss background */}
          <div className="absolute inset-0" onClick={() => setPaymentModalOpen(false)}></div>
          
          <div className="relative w-full max-w-sm rounded-t-[28px] bg-white border-t border-pink-200 px-6 py-8 z-10 shadow-2xl transition transform animate-[slideUp_0.3s_cubic-bezier(0.25,1,0.5,1)_both]">
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6"></div>
            
            {paymentLoading ? (
              <div id="paymentModalLoading" className="py-16 text-center">
                <Loader2 size={36} className="mx-auto text-pink-600 animate-spin mb-4" />
                <h4 className="text-sm font-bold text-slate-950 mb-1">Connecting Gateway...</h4>
                <p className="text-xs text-slate-400">Triggering UPI / NetBanking via Razorpay</p>
              </div>
            ) : (
              <div id="paymentModalDetails">
                <div className="flex items-center gap-3.5 mb-5">
                  <div className="w-11 h-11 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-lg">
                    🛡️
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold text-slate-950">Real Meet Verification</h3>
                    <p className="text-[0.62rem] text-slate-400 uppercase tracking-wider font-semibold">One-time registration fee</p>
                  </div>
                </div>

                <div className="h-[1px] bg-slate-100 mb-5"></div>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-lg font-bold text-pink-600 font-sans">₹</span>
                  <span className="font-serif text-4xl font-extrabold text-slate-950">49</span>
                  <span className="text-xs text-slate-400 ml-1.5 font-semibold">one-time key only</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-6 font-normal">
                  Verify your booking request safely. Direct personal photos sent instantly on WhatsApp / Bot. All main payments done in cash upon arrival.
                </p>

                <div className="bg-pink-50/50 border border-pink-100 rounded-xl p-4 flex flex-col gap-2.5 mb-6 text-xs text-slate-600">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 size={13} className="text-pink-500 shrink-0" />
                    <span>Personal access call with Pooja Mam</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 size={13} className="text-pink-500 shrink-0" />
                    <span>Instant unedited uncompressed photos</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 size={13} className="text-pink-500 shrink-0" />
                    <span>Indian &amp; Russian therapist selection</span>
                  </div>
                </div>

                <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-2.5 mb-6 flex items-center gap-2 text-[0.62rem] text-blue-800 font-semibold uppercase tracking-wider">
                  <ShieldCheck size={14} className="text-blue-505" />
                  <span>Secure gateway verified by Razorpay</span>
                </div>

                <div className="flex flex-col gap-2">
                  <button 
                    id="modalClosePayBtn"
                    onClick={handlePayNow}
                    className="flex items-center justify-center gap-1.5 w-full py-4 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-sm shadow-md shadow-pink-500/10 transition cursor-pointer"
                  >
                    <span>Proceed to Verify (₹49)</span>
                  </button>

                  <button 
                    id="modalCancelPayBtn"
                    onClick={() => setPaymentModalOpen(false)}
                    className="w-full py-3 rounded-xl hover:bg-slate-50 text-slate-400 text-xs font-semibold tracking-wide transition cursor-pointer"
                  >
                    Cancel, I prefer waiting
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* 9. FLOATING BRAND TELEGRAM BUTTON PERMANENT AT BOTTOM (Replaces Priya floating live chat assistant entirely!) */}
      <button 
        id="floatingTelegramBotBtn"
        onClick={handleTelegramClick}
        className="fixed bottom-6 right-6 z-30 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 text-white shadow-xl shadow-sky-500/35 transform hover:scale-108 active:scale-95 duration-150 cursor-pointer"
        aria-label="Connect with Telegram Bot"
        title="Direct Telegram Chat Bot Access"
      >
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-pink-500 border-2 border-white text-[10px] font-extrabold text-white items-center justify-center">1</span>
        </span>
        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
          <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      </button>


      {/* 10. TELEGRAM CONFIGURATOR MANAGEMENT DASHBOARD (Admin Control Panel) */}
      {configModalOpen && (
        <div id="telegramConfiguratorContainer" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-md animate-[fadeIn_0.2s_ease_both]">
          <div className="relative w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 md:p-8 shadow-2xl animate-[slideUp_0.3s_cubic-bezier(0.25,1,0.5,1)_both]">
            <button 
              id="closeAdminSettingsBtn"
              onClick={() => setConfigModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-150 flex items-center justify-center text-lg shadow-sm">
                ⚙️
              </div>
              <div>
                <h3 className="text-md font-bold text-slate-900 leading-tight">Telegram Bot Config</h3>
                <p className="text-[0.68rem] text-slate-500">Bind your Telegram channels to trace visitor leads</p>
              </div>
            </div>

            <div className="h-[1px] bg-slate-100 mb-5"></div>

            <form onSubmit={handleSaveBotConfig} className="space-y-4">
              <div>
                <label className="block text-[0.68rem] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Telegram Bot Token:
                </label>
                <input 
                  type="text" 
                  value={botConfig.token}
                  onChange={(e) => setBotConfig(prev => ({ ...prev, token: e.target.value }))}
                  placeholder="e.g. 123456789:ABCdefGhIjkLmNoPqRsTuVwXyZ" 
                  className="w-full text-xs p-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-150 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[0.68rem] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Telegram Private Chat ID (Target Log):
                </label>
                <input 
                  type="text" 
                  value={botConfig.chatId}
                  onChange={(e) => setBotConfig(prev => ({ ...prev, chatId: e.target.value }))}
                  placeholder="e.g. 8720928231" 
                  className="w-full text-xs p-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-150 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[0.68rem] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Bot Name Username (Redirection Link ID):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-xs text-slate-400 font-bold">@</span>
                  <input 
                    type="text" 
                    value={botConfig.botUsername}
                    onChange={(e) => setBotConfig(prev => ({ ...prev, botUsername: e.target.value }))}
                    placeholder="xkhushii" 
                    className="w-full text-xs pl-8 pr-3 p-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-150 outline-none"
                    required
                  />
                </div>
              </div>

              {configSaveStatus === 'success' && (
                <div className="p-3 text-center bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-semibold animate-pulse">
                  ✓ Bot settings updated &amp; Webhook set successfully!
                </div>
              )}

              {configSaveStatus === 'error' && (
                <div className="p-3 text-center bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold">
                  ⚠️ Error saving config parameters. Retry.
                </div>
              )}

              <div className="flex gap-2.5 pt-2">
                <button 
                  type="submit" 
                  className="flex-1 py-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
                >
                  {configSaveStatus === 'saving' ? 'Saving Credentials...' : 'Save Configuration'}
                </button>

                <button 
                  type="button"
                  id="testConnectionBtn"
                  onClick={handleTestBotConnection}
                  disabled={testSending}
                  className="px-4 py-3.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition text-xs font-bold shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {testSending ? 'Testing...' : 'Test Message'}
                </button>
              </div>

              {testMessage === 'success' && (
                <div className="text-[0.68rem] text-center text-green-600 font-bold mt-2 animate-bounce">
                  ⚡ Test sent! Verify your target Telegram channel.
                </div>
              )}
              {testMessage && testMessage !== 'success' && (
                <div className="text-[0.68rem] text-center text-rose-500 font-bold mt-2">
                  ❌ Fail: {testMessage}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
