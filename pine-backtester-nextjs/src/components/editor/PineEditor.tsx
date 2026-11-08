'use client';

import React, { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Play, Copy, Check, FileCode, Sparkles, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export interface StrategyPreset {
  id: string;
  name: string;
  filename: string;
  type: 'strategy' | 'indicator';
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
  { id: 'grandmaster_strat', name: 'Grandmaster 15M (Dual 10R)', filename: 'Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', type: 'strategy' },
  { id: 'grandmaster_ind', name: 'Grandmaster 15M Indicator', filename: 'Champion_15M_Grandmaster_Dual10R_Oct8R_INDICATOR.pine', type: 'indicator' },
  { id: 'apex_strat', name: 'Apex 15M Trend Alpha', filename: 'Champion_15M_Apex_88WR_STRATEGY.pine', type: 'strategy' },
  { id: 'apex_ind', name: 'Apex 15M Trend Indicator', filename: 'Champion_15M_Apex_88WR_INDICATOR.pine', type: 'indicator' },
  { id: 'rr1to2_strat', name: '1:2 Risk/Reward Parity', filename: 'Champion_15M_1to2RR_75WR_STRATEGY.pine', type: 'strategy' },
  { id: 'rr1to2_ind', name: '1:2 Risk/Reward Indicator', filename: 'Champion_15M_1to2RR_75WR_INDICATOR.pine', type: 'indicator' },
  { id: 'elite80_strat', name: 'Elite Volatility Scalp', filename: 'Champion_15M_80WR_Elite_STRATEGY.pine', type: 'strategy' },
  { id: 'elite80_ind', name: 'Elite Volatility Indicator', filename: 'Champion_15M_80WR_Elite_INDICATOR.pine', type: 'indicator' },
];

interface PineEditorProps {
  code: string;
  onChange: (value: string) => void;
  onRunBacktest: () => void;
  isLoading?: boolean;
  onSelectPreset?: (filename: string) => void;
  currentPreset?: string;
  errorMessage?: string | null;
}

export function PineEditor({
  code,
  onChange,
  onRunBacktest,
  isLoading = false,
  onSelectPreset,
  currentPreset,
  errorMessage,
}: PineEditorProps) {
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<any>(null);

  // Note: Do NOT manually call editor.dispose() in useEffect;
  // @monaco-editor/react manages the editor lifecycle internally.
  React.useEffect(() => {
    return () => {
      editorRef.current = null;
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    if (!editor || !monaco) return;
    editorRef.current = editor;
    try {
      editor.onDidDispose(() => {
        editorRef.current = null;
      });
    } catch {}

    // Register pinescript language if not already registered
    if (!monaco.languages.getLanguages().some((l: any) => l.id === 'pinescript')) {
      monaco.languages.register({ id: 'pinescript' });
      monaco.languages.setMonarchTokensProvider('pinescript', {
        symbols: /[=><!~?:&|+\-*\/\^%]+/,
        keywords: [
          'strategy', 'indicator', 'plot', 'plotshape', 'table', 'input', 'if', 'else',
          'for', 'to', 'by', 'while', 'var', 'varip', 'true', 'false', 'na', 'import',
          'export', 'type', 'method',
        ],
        typeKeywords: ['int', 'float', 'bool', 'string', 'color', 'line', 'label', 'box', 'table'],
        builtins: [
          'close', 'open', 'high', 'low', 'volume', 'time', 'hl2', 'hlc3', 'ohlc4',
          'ta.sma', 'ta.ema', 'ta.rsi', 'ta.atr', 'ta.stdev', 'ta.cross', 'ta.crossover', 'ta.crossunder',
          'strategy.entry', 'strategy.exit', 'strategy.close', 'strategy.position_size',
          'strategy.closedtrades', 'strategy.netprofit', 'strategy.max_drawdown',
          'input.string', 'input.float', 'input.int', 'input.bool', 'input.color',
          'color.rgb', 'color.new', 'color.red', 'color.green', 'color.blue',
          'math.abs', 'math.max', 'math.min', 'str.tostring', 'dayofmonth', 'hour',
        ],
        tokenizer: {
          root: [
            [/[a-zA-Z_]\w*/, {
              cases: {
                '@keywords': 'keyword',
                '@typeKeywords': 'type',
                '@builtins': 'predefined',
                '@default': 'identifier',
              },
            }],
            { include: '@whitespace' },
            [/[{}()\[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [/@symbols/, 'delimiter'],
            [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
            [/\d+/, 'number'],
            [/[;,.]/, 'delimiter'],
            [/"([^"\\]|\\.)*"/, 'string'],
            [/'([^'\\]|\\.)*'/, 'string'],
          ],
          whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/\/\/.*$/, 'comment'],
          ],
        },
      });

      // Define light theme
      monaco.editor.defineTheme('elvaris-light', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: '0284c7', fontStyle: 'bold' },
          { token: 'type', foreground: '7c3aed' },
          { token: 'predefined', foreground: '059669' },
          { token: 'string', foreground: 'd97706' },
          { token: 'comment', foreground: '94a3b8', fontStyle: 'italic' },
          { token: 'number', foreground: 'e11d48' },
        ],
        colors: {
          'editor.background': '#FFFFFF',
          'editor.foreground': '#0F172A',
          'editorLineNumber.foreground': '#94A3B8',
          'editorLineNumber.activeForeground': '#0284C7',
          'editor.lineHighlightBackground': '#F8FAFC',
          'editor.selectionBackground': '#BAE6FD40',
        },
      });
    }

    try {
      monaco.editor.setTheme('elvaris-light');

      // Add Ctrl+Enter shortcut to run backtest
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        onRunBacktest();
      });
    } catch {}
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)] text-xs">
        {/* Left: Preset Selector */}
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-[var(--brand)]" />
          <span className="font-semibold text-[var(--text-1)]">Pine Script v5</span>

          <select
            value={currentPreset || ''}
            onChange={(e) => onSelectPreset?.(e.target.value)}
            className="bg-[var(--bg-surface)] text-[var(--text-1)] border border-[var(--border-subtle)] rounded-md px-2 py-1 text-xs focus:outline-hidden focus:border-[var(--brand)] shadow-xs"
          >
            <option value="" disabled>Select Strategy Preset...</option>
            {STRATEGY_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.filename}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="text-xs h-7"
            title="Copy script to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[var(--profit)]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={onRunBacktest}
            disabled={isLoading}
            className="text-xs h-7 font-semibold gap-1.5 shadow-xs"
            title="Run Backtest Simulation (Ctrl + Enter)"
          >
            <Play className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : 'fill-current'}`} />
            <span>{isLoading ? 'Simulating...' : 'Run Strategy'}</span>
          </Button>
        </div>
      </div>

      {/* Compiler Error Banner if present */}
      {errorMessage && (
        <div className="px-3 py-1.5 bg-[var(--loss-subtle)] border-b border-[var(--loss)]/20 flex items-center gap-2 text-xs text-[var(--loss)]">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono truncate">{errorMessage}</span>
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 w-full min-h-[300px] relative">
        <MonacoEditor
          height="100%"
          language="pinescript"
          value={code}
          keepCurrentModel={false}
          onChange={(val) => onChange(val || '')}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 12,
            fontFamily: 'Consolas, "Fira Code", monospace',
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            tabSize: 4,
            bracketPairColorization: { enabled: true },
            cursorBlinking: 'smooth',
            renderLineHighlight: 'line',
          }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 bg-[var(--bg-subtle)] border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-3)] font-mono">
        <span>Paste any Pine Script strategy or select a preset above</span>
        <span className="hidden sm:inline">Shortcut: Ctrl+Enter to Run</span>
      </div>
    </div>
  );
}
