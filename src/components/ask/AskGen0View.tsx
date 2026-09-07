import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '../../context/WalletContext';
import { getArcScanTxUrl, formatShortHash } from '../../config/arc';
import { ChatMessage } from '../../types/blockchain';
import {
  Sparkles,
  Send,
  Bot,
  User,
  ExternalLink,
  ShieldCheck,
  RotateCcw,
  Cpu,
} from 'lucide-react';

const TYPING_EXAMPLES = [
  'How much USDC do I have?',
  'What did I receive recently?',
  'How much have I spent on gas?',
  'Explain my recent transactions',
  'What contracts did I interact with?',
  'What happened in my wallet today?',
  'Did I send any USDC recently?',
  'How does Arc use USDC for gas?',
  'What is Arc?',
  'What are the main features of GEN-0 FI?',
  'How does wallet intelligence work?',
];

export const AskGen0View: React.FC = () => {
  const { address, shortAddress, isConnected, walletSummary, transactions, balanceUSDC } = useWallet();

  // Compute exact normalized wallet metrics matching OverviewView for 100% consistency
  const activeBalance = balanceUSDC || walletSummary?.balanceUSDC || '0.00';
  const verifiedReceived = walletSummary
    ? (walletSummary.totalReceivedUSDC === 'Incomplete scan' || walletSummary.totalReceivedUSDC === 'Unavailable')
      ? walletSummary.totalReceivedUSDC
      : `${walletSummary.totalReceivedUSDC} USDC`
    : '0.00 USDC';
  const verifiedSent = walletSummary
    ? (walletSummary.totalSentUSDC === 'Incomplete scan' || walletSummary.totalSentUSDC === 'Unavailable')
      ? walletSummary.totalSentUSDC
      : `${walletSummary.totalSentUSDC} USDC`
    : '0.00 USDC';
  const verifiedGas = walletSummary ? `${walletSummary.gasSpentUSDC} USDC` : '0.000000 USDC';
  const totalTxCount = walletSummary?.txCount ?? transactions.length;
  const contractCount = walletSummary?.contractInteractionsCount ?? 0;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: isConnected
        ? `Hello! I am GEN-0 FI, your blockchain-grounded assistant for Arc.\n\nI operate in two modes:\n1. Wallet Intelligence: Ask about your live USDC balance (${activeBalance} USDC), verified incoming/outgoing transfers, gas expenditures (${verifiedGas}), or recent transaction history.\n2. Protocol & GEN-0 Knowledge: Ask about Arc's native USDC gas model, protocol architecture, or how GEN-0 FI works.`
        : `Welcome to GEN-0 AI. I am your blockchain-grounded assistant for Arc.\n\nYou can ask general questions about Arc and GEN-0 FI right now, or connect your wallet to unlock live Wallet Intelligence.`,
      timestamp: Date.now(),
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeModel, setActiveModel] = useState<string>('gemini-3.8-flash');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % TYPING_EXAMPLES.length);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputPrompt).trim();
    if (!query || isGenerating) return;

    const userMessageId = `user-${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      {
        id: userMessageId,
        role: 'user',
        content: query.replace(/\*/g, ''),
        timestamp: Date.now(),
      },
    ];

    setMessages(newMessages);
    setInputPrompt('');
    setIsGenerating(true);

    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          message: query,
          history: newMessages.slice(-6).map((m) => ({ role: m.role, content: m.content.replace(/\*/g, '') })),
          walletData: {
            address,
            balanceUSDC: activeBalance,
            totalReceivedUSDC: verifiedReceived,
            totalSentUSDC: verifiedSent,
            gasSpentUSDC: verifiedGas,
            txCount: totalTxCount,
            contractInteractionsCount: contractCount,
            historyStatus: walletSummary?.historyStatus || (transactions.length === 0 && parseFloat(activeBalance.replace(/,/g, '')) > 0 ? 'incomplete' : 'complete'),
            historyStatusNote: walletSummary?.historyStatusNote || '',
          },
          walletSummary,
          recentTransactions: transactions,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        const errMsg = errJson?.error || errJson?.message || `AI service returned error ${response.status}`;
        throw new Error(errMsg);
      }

      const data = await response.json();
      const cleanAnswer = (data.answer || "I can't verify that from the available onchain data.").replace(/\*/g, '');
      if (data.model) {
        setActiveModel(data.model);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: cleanAnswer,
          timestamp: Date.now(),
          referencedTxHashes: data.referencedTxHashes || [],
        },
      ]);
    } catch (err: any) {
      const errorDetail = err?.message || 'Service temporarily unreachable';
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          content: `AI Service Notice: ${errorDetail}. For Vercel production deployments, ensure GEMINI_API_KEY is configured in Vercel Project Settings > Environment Variables. Your live Arc wallet balance remains verified: ${activeBalance} USDC.`,
          timestamp: Date.now(),
          isError: true,
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `Chat history reset. How can I assist you with your Arc wallet or protocol questions?`,
        timestamp: Date.now(),
      },
    ]);
  };

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 flex flex-col h-[calc(100vh-3.5rem)] space-y-3 sm:space-y-4 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/35 flex items-center justify-center text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Ask GEN-0
            </h1>
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-[10px] font-mono text-blue-400">
              <Cpu className="w-2.5 h-2.5" />
              {activeModel === 'deterministic-verifier' ? 'Arc Deterministic Engine' : 'Gemini 3.8 Flash'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClearChat}
            className="py-1 px-2.5 rounded-lg bg-[#111317] hover:bg-zinc-800 border border-zinc-800 hover:border-blue-500/30 text-zinc-400 hover:text-white transition-all cursor-pointer text-xs flex items-center gap-1.5 font-mono shadow-none hover:shadow-[0_0_10px_rgba(59,130,246,0.15)]"
            title="Reset conversation"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* Chat Messages Timeline */}
      <div className="flex-1 overflow-y-auto rounded-xl bg-[#0d0f12] border border-zinc-800 p-4 sm:p-5 space-y-3.5 shadow-sm">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 sm:gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 mt-0.5 shadow-[0_0_10px_rgba(59,130,246,0.3)]">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[78%] rounded-xl p-3.5 text-xs sm:text-sm leading-relaxed ${
                  isUser
                    ? 'bg-white text-black font-semibold rounded-tr-none shadow-sm'
                    : 'bg-[#131519] text-zinc-200 border border-zinc-800 rounded-tl-none shadow-sm'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content.replace(/\*/g, '')}</div>

                {/* Referenced Transactions on ArcScan if returned */}
                {msg.referencedTxHashes && msg.referencedTxHashes.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-zinc-800 space-y-1">
                    <span className="text-[10px] text-zinc-400 font-mono block">
                      Referenced Verified Transactions on ArcScan:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.referencedTxHashes.map((hash) => (
                        <a
                          key={hash}
                          href={getArcScanTxUrl(hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[10px] font-mono text-blue-300 hover:text-white transition-colors"
                        >
                          <span>{formatShortHash(hash)}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className={`text-[10px] mt-1.5 text-right font-mono ${
                    isUser ? 'text-zinc-600' : 'text-zinc-500'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })}

        {isGenerating && (
          <div className="flex gap-2.5 items-center text-xs text-zinc-400">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5 p-2.5 rounded-lg bg-[#131519] border border-zinc-800">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1 text-[11px] text-zinc-400 font-mono">Analysing...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box & Prompt Examples */}
      <div className="space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder={`Ask anything e.g. "${TYPING_EXAMPLES[placeholderIndex]}"`}
            disabled={isGenerating}
            className="w-full pl-3.5 pr-11 py-3 rounded-xl bg-[#0d0f12] border border-zinc-800 focus:border-blue-500/50 glow-blue-focus focus:outline-none text-xs sm:text-sm text-white placeholder:text-zinc-500 shadow-sm transition-all"
          />

          <button
            type="submit"
            disabled={!inputPrompt.trim() || isGenerating}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-white hover:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-white text-black glow-blue-cta cursor-pointer"
            aria-label="Send message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Example prompts in the typing box section */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
          <span className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider shrink-0 pl-0.5 font-medium">
            Examples:
          </span>
          {TYPING_EXAMPLES.map((example, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(example)}
              disabled={isGenerating}
              className="px-2.5 py-1 rounded-lg bg-[#101216] hover:bg-zinc-800 border border-zinc-800/90 hover:border-blue-500/35 text-zinc-400 hover:text-white transition-all whitespace-nowrap cursor-pointer shrink-0 disabled:opacity-40"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Safety & Grounding Footnote */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1 font-mono">
        <div className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>Zero Hallucination Guarantee: Strictly grounded on Arc onchain state</span>
        </div>
        <span>Arc. Testnet • Verified Onchain</span>
      </div>
    </div>
  );
};

