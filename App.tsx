
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { SchoolReport, Feedback, AIInsight } from './types';
import { analyzeEducationData, decode, encode, decodeAudioData } from './services/geminiService';

// --- Components ---

// Fixed: Added ...props to support key and other standard React props, and made children optional to satisfy strict TS environments
const Card = ({ children, className = "", ...props }: { children?: React.ReactNode; className?: string; [key: string]: any }) => (
  <div className={`bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden ${className}`} {...props}>{children}</div>
);

// Fixed: Added ...props and made children optional to resolve TS compilation errors regarding missing children/key
const Button = ({ 
  children, 
  onClick, 
  className = "", 
  disabled = false, 
  variant = "primary", 
  type = "button",
  ...props
}: { 
  children?: React.ReactNode; 
  onClick?: () => void; 
  className?: string; 
  disabled?: boolean; 
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost";
  type?: "button" | "submit" | "reset";
  [key: string]: any;
}) => {
  const variants = {
    primary: "bg-[#00ADEF] hover:bg-[#0096d1] text-white shadow-lg shadow-blue-500/10",
    secondary: "bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/10",
    danger: "bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/10",
    outline: "border border-slate-200 hover:bg-slate-50 text-slate-600",
    ghost: "hover:bg-slate-100 text-slate-600"
  };
  return (
    <button 
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`px-5 py-3 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

const InputField = ({ label, value, onChange, placeholder, type = "text", icon }: any) => (
  <div className="space-y-1.5">
    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">{label}</label>
    <div className="relative group">
      {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#00ADEF] transition-colors">{icon}</div>}
      <input 
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full ${icon ? 'pl-11' : 'px-4'} py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-[#00ADEF] outline-none transition-all placeholder:text-slate-300 font-medium`}
      />
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const [reports, setReports] = useState<SchoolReport[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [schoolForm, setSchoolForm] = useState({ name: '', location: '', issues: '' });
  const [feedbackForm, setFeedbackForm] = useState({ role: '', message: '' });
  
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Live API State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<{role: 'user' | 'ai' | 'system', text: string}[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const inputCtxRef = useRef<AudioContext | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginForm.username === 'admin' && loginForm.password === 'password') {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Invalid credentials. Prototype mode: use admin/password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setLoginForm({ username: '', password: '' });
  };

  const handleDetectLocation = () => {
    setIsLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setSchoolForm(prev => ({ 
            ...prev, 
            location: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}` 
          }));
          setIsLocating(false);
        },
        () => {
          alert("Location permission denied or unavailable.");
          setIsLocating(false);
        }
      );
    }
  };

  const handleSchoolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolForm.name || !schoolForm.issues) return;
    const newReport: SchoolReport = {
      id: Math.random().toString(36).substr(2, 9),
      schoolName: schoolForm.name,
      district: schoolForm.location || 'Unknown District',
      province: 'Pakistan',
      issues: schoolForm.issues,
      timestamp: Date.now()
    };
    setReports([newReport, ...reports]);
    setSchoolForm({ name: '', location: '', issues: '' });
  };

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackForm.message) return;
    const newFeedback: Feedback = {
      id: Math.random().toString(36).substr(2, 9),
      role: feedbackForm.role || 'Community Member',
      message: feedbackForm.message,
      timestamp: Date.now()
    };
    setFeedbacks([newFeedback, ...feedbacks]);
    setFeedbackForm({ role: '', message: '' });
  };

  const generateStrategicInsight = async () => {
    if (reports.length === 0) return;
    setIsAnalyzing(true);
    try {
      const data = await analyzeEducationData(reports);
      setInsight(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleLiveReporting = async () => {
    if (isLiveActive) {
      setIsLiveActive(false);
      // Basic cleanup
      inputCtxRef.current?.close();
      audioContextRef.current?.close();
      return;
    }

    try {
      // Fixed: Instantiating AI right before use with correct apiKey usage
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const inCtx = new AudioContext({ sampleRate: 16000 });
      const outCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inCtx;
      audioContextRef.current = outCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsLiveActive(true);
            setLiveTranscript([{role: 'system', text: 'Assistant connected. Describe the school situation.'}]);
            
            const source = inCtx.createMediaStreamSource(stream);
            const scriptProcessor = inCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              // Fixed: Removed local state check inside processor to avoid stale closures; rely on sessionPromise
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              
              const pcmData = { 
                data: encode(new Uint8Array(int16.buffer)), 
                mimeType: 'audio/pcm;rate=16000' 
              };
              
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmData }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Audio playback
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              const bytes = decode(audioData);
              const buffer = await decodeAudioData(bytes, outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outCtx.destination);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }

            // Transcriptions
            if (message.serverContent?.outputTranscription) {
              setLiveTranscript(prev => [...prev, {role: 'ai', text: message.serverContent?.outputTranscription?.text || ''}]);
            }
            if (message.serverContent?.inputTranscription) {
              setLiveTranscript(prev => [...prev, {role: 'user', text: message.serverContent?.inputTranscription?.text || ''}]);
            }
          },
          onclose: () => setIsLiveActive(false),
          onerror: (e) => {
            console.error(e);
            setIsLiveActive(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: "You are a professional UNICEF education officer in Pakistan. Help users report school infrastructure issues. Be empathetic, formal, and clear.",
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        }
      });
    } catch (err) {
      console.error(err);
      alert("Microphone access failed.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-10 border-t-8 border-[#00ADEF]">
          <div className="flex flex-col items-center mb-10">
            <div className="bg-[#00ADEF] p-5 rounded-[2rem] mb-6 shadow-2xl shadow-blue-500/30">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Intelligence Portal</h1>
            <p className="text-slate-500 text-sm mt-2 text-center">UNICEF Pakistan Education Monitoring System</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <InputField 
              label="Personnel Username"
              value={loginForm.username}
              onChange={(e: any) => setLoginForm({...loginForm, username: e.target.value})}
              placeholder="e.g. officer_name"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>}
            />
            <InputField 
              label="Secure Passcode"
              type="password"
              value={loginForm.password}
              onChange={(e: any) => setLoginForm({...loginForm, password: e.target.value})}
              placeholder="••••••••"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>}
            />
            
            {loginError && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3">
                <div className="w-2 h-2 bg-rose-500 rounded-full"></div>
                <p className="text-rose-600 text-xs font-bold uppercase tracking-wider">{loginError}</p>
              </div>
            )}

            <Button type="submit" className="w-full py-4.5 text-lg">Initialize Session</Button>
          </form>

          <div className="mt-10 pt-8 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-[0.3em] font-black">Authorized Access Only</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-[#00ADEF] p-2 rounded-xl shadow-lg shadow-blue-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 leading-none">EduIntelligence</h1>
              <p className="text-xs font-bold text-[#00ADEF] mt-0.5 tracking-wider uppercase">Pakistan Monitoring Hub</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Signed In As</span>
              <span className="text-sm font-bold text-slate-700">{loginForm.username}</span>
            </div>
            <Button variant="outline" onClick={handleLogout} className="px-4 py-2 text-xs">Sign Out</Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        
        {/* Input Column */}
        <div className="lg:col-span-4 space-y-8">
          <section className="space-y-4">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-[#00ADEF] rounded-full"></div>
              Data Intake
            </h2>
            
            <Card className="p-8">
              <form onSubmit={handleSchoolSubmit} className="space-y-6">
                <InputField 
                  label="School Designation"
                  value={schoolForm.name}
                  onChange={(e: any) => setSchoolForm({...schoolForm, name: e.target.value})}
                  placeholder="e.g. GPS Larkana Secondary"
                />
                
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">District / Geospatial Reference</label>
                  <div className="flex gap-2">
                    <input 
                      value={schoolForm.location}
                      onChange={(e: any) => setSchoolForm({...schoolForm, location: e.target.value})}
                      placeholder="Lat, Lng or District name"
                      className="flex-1 px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-[#00ADEF] outline-none transition-all placeholder:text-slate-300 font-medium"
                    />
                    <button 
                      type="button"
                      onClick={handleDetectLocation}
                      disabled={isLocating}
                      className="p-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all disabled:opacity-50"
                      title="Auto-detect Location"
                    >
                      <svg className={`w-6 h-6 ${isLocating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Primary Concerns</label>
                  <textarea 
                    value={schoolForm.issues}
                    onChange={(e: any) => setSchoolForm({...schoolForm, issues: e.target.value})}
                    placeholder="Infrastructure, Teacher absenteeism, WASH facilities..."
                    className="w-full min-h-[140px] px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-[#00ADEF] outline-none transition-all placeholder:text-slate-300 font-medium resize-none"
                  />
                </div>

                <Button type="submit" className="w-full py-4">Commit Report</Button>
              </form>
            </Card>

            <Card className="p-8 bg-slate-900 text-white">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"/></svg>
                Community Feedback
              </h3>
              <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                <select 
                  value={feedbackForm.role}
                  onChange={(e: any) => setFeedbackForm({...feedbackForm, role: e.target.value})}
                  className="w-full px-4 py-3.5 bg-slate-800 border border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Respondent Role</option>
                  <option value="Teacher">Educator/Teacher</option>
                  <option value="Parent">Parent/Guardian</option>
                  <option value="Admin">Local Administration</option>
                  <option value="Other">Other Stakeholder</option>
                </select>
                <textarea 
                  value={feedbackForm.message}
                  onChange={(e: any) => setFeedbackForm({...feedbackForm, message: e.target.value})}
                  placeholder="Record community observations..."
                  className="w-full min-h-[100px] px-4 py-3.5 bg-slate-800 border border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <Button type="submit" variant="outline" className="w-full text-white border-slate-700 hover:bg-slate-800">Submit Observation</Button>
              </form>
            </Card>
          </section>
        </div>

        {/* Analytics & Feed Column */}
        <div className="lg:col-span-8 space-y-10">
          
          {/* AI Strategy Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                Strategic Intelligence
              </h2>
              <Button 
                onClick={generateStrategicInsight} 
                disabled={isAnalyzing || reports.length === 0}
                variant="secondary"
                className="py-2 text-xs h-10"
              >
                {isAnalyzing ? (
                  <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Generating...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Run Analysis</>
                )}
              </Button>
            </div>

            <Card className="p-8 bg-gradient-to-br from-[#00ADEF]/5 to-white border-blue-100">
              {!insight ? (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-400">Awaiting Intelligence Stream</h3>
                  <p className="text-sm text-slate-400 mt-2 max-w-xs mx-auto">Commit school reports to initialize automated strategic priority generation.</p>
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="flex flex-col md:flex-row gap-8">
                    <div className="md:w-3/5 space-y-6">
                      <div>
                        <h3 className="text-xs font-black text-[#00ADEF] uppercase tracking-widest mb-3">Policy Brief</h3>
                        <p className="text-slate-700 leading-relaxed font-medium">{insight.summary}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {insight.suggestedResources.map((res, i) => (
                          <span key={i} className="px-3 py-1.5 bg-blue-50 text-[#00ADEF] text-[10px] font-black uppercase rounded-lg border border-blue-100">{res}</span>
                        ))}
                      </div>
                    </div>
                    <div className="md:w-2/5">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Urgent Priorities</h3>
                      <ul className="space-y-3">
                        {insight.priorities.map((item, i) => (
                          <li key={i} className="flex gap-4 p-4 bg-white rounded-2xl border border-blue-50 shadow-sm">
                            <span className="text-blue-500 font-black text-sm">{i + 1}.</span>
                            <span className="text-xs font-bold text-slate-600 leading-tight">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </section>

          {/* Activity Feed */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            <div className="space-y-4">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center justify-between">
                <span>School Log</span>
                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[9px]">{reports.length} Reports</span>
              </h2>
              <div className="space-y-4">
                {reports.length === 0 ? (
                  <p className="text-sm text-slate-300 italic p-6 border-2 border-dashed border-slate-100 rounded-3xl text-center">No reports archived in this session.</p>
                ) : (
                  reports.map(report => (
                    <Card key={report.id} className="p-6 group hover:border-[#00ADEF] transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-extrabold text-slate-900 group-hover:text-[#00ADEF] transition-colors">{report.schoolName}</h4>
                        <span className="text-[10px] text-slate-400 font-bold">{new Date(report.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-4">
                        <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{report.district}</span>
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-3 font-medium leading-relaxed">{report.issues}</p>
                    </Card>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center justify-between">
                <span>Voice Stream</span>
                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[9px]">{feedbacks.length} Feedback</span>
              </h2>
              <div className="space-y-4">
                {feedbacks.length === 0 ? (
                  <p className="text-sm text-slate-300 italic p-6 border-2 border-dashed border-slate-100 rounded-3xl text-center">No community feedback recorded.</p>
                ) : (
                  feedbacks.map(f => (
                    <div key={f.id} className="p-6 bg-slate-50 rounded-3xl border-transparent">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{f.role}</span>
                      </div>
                      <p className="text-sm text-slate-700 font-medium leading-relaxed italic">"{f.message}"</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Floating Action Button for Voice Assistant */}
      <div className="fixed bottom-10 right-10 z-[100]">
        {!isLiveActive ? (
          <button 
            onClick={toggleLiveReporting}
            className="w-20 h-20 bg-[#00ADEF] text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform group animate-bounce-slow"
          >
            <div className="absolute inset-0 bg-[#00ADEF] rounded-full animate-ping opacity-20"></div>
            <svg className="w-10 h-10 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
        ) : (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-2xl flex items-center justify-center p-6 z-[200] animate-in fade-in duration-300">
            <Card className="w-full max-w-2xl p-10 bg-slate-800 border-slate-700 text-white shadow-3xl overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-500 animate-pulse"></div>
              
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-8">
                  <div className="w-32 h-32 rounded-full border-4 border-blue-500/20 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center shadow-2xl shadow-blue-500/50">
                      <div className="flex items-end gap-1.5 h-8">
                        <div className="w-1.5 bg-white/40 animate-music-1 rounded-full"></div>
                        <div className="w-1.5 bg-white animate-music-2 rounded-full"></div>
                        <div className="w-1.5 bg-white/80 animate-music-3 rounded-full"></div>
                        <div className="w-1.5 bg-white/60 animate-music-4 rounded-full"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <h2 className="text-3xl font-black mb-2 tracking-tight">Active Voice Intake</h2>
                <p className="text-blue-400 font-bold text-xs uppercase tracking-widest mb-8">Assistant Listening...</p>

                <div className="w-full h-[300px] overflow-y-auto mb-10 space-y-4 text-left bg-slate-900/50 p-6 rounded-3xl scrollbar-hide">
                  {liveTranscript.map((entry, i) => (
                    <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] p-4 rounded-2xl text-sm font-medium ${
                        entry.role === 'ai' ? 'bg-slate-700 text-blue-100' : 
                        entry.role === 'user' ? 'bg-blue-600 text-white' : 
                        'bg-slate-800 text-slate-400 italic text-xs w-full text-center border border-slate-700'
                      }`}>
                        {entry.text}
                      </div>
                    </div>
                  ))}
                </div>

                <Button onClick={toggleLiveReporting} variant="danger" className="w-full py-4.5 rounded-2xl">Terminated Intake Session</Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow { animation: bounce-slow 3s ease-in-out infinite; }
        
        @keyframes music-1 { 0%, 100% { height: 12px; } 50% { height: 24px; } }
        @keyframes music-2 { 0%, 100% { height: 20px; } 50% { height: 32px; } }
        @keyframes music-3 { 0%, 100% { height: 16px; } 50% { height: 28px; } }
        @keyframes music-4 { 0%, 100% { height: 14px; } 50% { height: 26px; } }
        .animate-music-1 { animation: music-1 0.8s ease-in-out infinite; }
        .animate-music-2 { animation: music-2 1.1s ease-in-out infinite; }
        .animate-music-3 { animation: music-3 0.9s ease-in-out infinite; }
        .animate-music-4 { animation: music-4 1.2s ease-in-out infinite; }
        
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
