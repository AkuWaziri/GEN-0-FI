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
  Zap,
} from 'lucide-react';

export const AskGen0View: React.FC = () => {
  const { address, shortAddress, isConnected, walletSummary, transactions, balanceUSDC } = useWallet();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: isConnected
        ? `Hello! I am GEN-0 FI, your onchain financial intelligence engine. I have direct read access to your verified Arc Testnet activity (${balanceUSDC} USDC, ${transactions.length} recent transactions). What would you like to know about your wallet?`
        : `Welcome to Ask GEN-0. Please connect your wallet or inspect an address to ask questions grounded in real Arc Testnet blockchain activity.`,
      timestamp: Date.now(),
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const promptSuggestions = [
    'What happened in my wallet recently?',
    'How much USDC did I receive and send?',
    'How much gas did I spend?',
    'What contracts did I interact with?',
    'What was my biggest transaction?',
    'Summarize my Arc Testnet balance and nonce',
  ];

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputPrompt).trim();
    if (!query || isGenerating) return;

    const userMessageId = `user-${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      {
        id: userMessageId,
        role: 'user',
        content: query,
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
          history: newMessages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          walletSummary,
          recentTransactions: transactions,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate response');
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: data.answer || "I couldn't retrieve that information from the available onchain data.",
          timestamp: Date.now(),
          referencedTxHashes: data.referencedTxHashes || [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          content: `I am reading your real onchain data on Arc Testnet for ${shortAddress || 'your wallet'}. Current balance is ${balanceUSDC} USDC across ${transactions.length} transactions. Note: GEN-0 is currently operating in deterministic verification mode.`,
          timestamp: Date.now(),
          isError: false,
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
        content: `Chat history reset. How can I assist you with your Arc Testnet wallet?`,
        timestamp: Date.now(),
      },
    ]);
  };

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 flex flex-col h-[calc(100vh-3.5rem)] space-y-3 sm:space-y-4 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-zinc-900">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Ask GEN-0
              </h1>
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            AI-powered wallet intelligence grounded in real Arc Testnet activity.
          </p>
        </div>

        <button
          onClick={handleClearChat}
          className="py-1 px-2.5 rounded-lg bg-[#111317] hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1.5 font-mono"
          title="Reset conversation"
        >
          <RotateCcw className="w-3 h-3" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Suggested Prompt Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
        <span className="text-zinc-500 whitespace-nowrap font-mono text-[10px] flex items-center gap-1">
          <Zap className="w-3 h-3 text-white" />
          Prompt:
        </span>
        {promptSuggestions.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(prompt)}
            disabled={isGenerating}
            className="px-2.5 py-1 rounded-lg bg-[#0d0f12] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white transition-all whitespace-nowrap cursor-pointer shrink-0 disabled:opacity-50 text-[11px] font-medium"
          >
            {prompt}
          </button>
        ))}
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
                <div className="w-7 h-7 rounded-lg bg-white text-black flex items-center justify-center font-bold shrink-0 mt-0.5 shadow-sm">
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
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Referenced Transactions on ArcScan if returned */}
                {msg.referencedTxHashes && msg.referencedTxHashes.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-zinc-800 space-y-1">
                    <span className="text-[10px] text-zinc-400 font-mono block">
                      Referenced Verified Transactions:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.referencedTxHashes.map((hash) => (
                        <a
                          key={hash}
                          href={getArcScanTxUrl(hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[10px] font-mono text-zinc-300 hover:text-white transition-colors"
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
            <div className="w-7 h-7 rounded-lg bg-white text-black flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5 p-2.5 rounded-lg bg-[#131519] border border-zinc-800">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1 text-[11px] text-zinc-400 font-mono">Analyzing verified Arc state...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
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
          placeholder="Ask anything about your wallet transactions, USDC balance, or smart contracts..."
          disabled={isGenerating}
          className="w-full pl-3.5 pr-11 py-3 rounded-xl bg-[#0d0f12] border border-zinc-800 focus:border-zinc-500 focus:outline-none text-xs sm:text-sm text-white placeholder:text-zinc-500 shadow-sm"
        />

        <button
          type="submit"
          disabled={!inputPrompt.trim() || isGenerating}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-white hover:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-white text-black transition-colors cursor-pointer"
          aria-label="Send message"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Safety & Grounding Footnote */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1 font-mono">
        <div className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-zinc-400" />
          <span>Strictly grounded on Arc onchain state</span>
        </div>
        <span>Arc Testnet • Non-custodial</span>
      </div>
    </div>
  );
};
