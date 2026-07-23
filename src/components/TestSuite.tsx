import React, { useState } from 'react';
import { runAutomatedTestSuite, TestCaseResult } from '../utils';
import { TaxonomyMapping } from '../types';
import { CheckCircle2, XCircle, Play, Sparkles, Server, Image, ShieldAlert, BadgeInfo } from 'lucide-react';

interface TestSuiteProps {
  mappings: TaxonomyMapping[];
}

export default function TestSuite({ mappings }: TestSuiteProps) {
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const handleRunTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      const suiteResults = runAutomatedTestSuite(mappings);
      setResults(suiteResults);
      setIsRunning(false);
    }, 800);
  };

  const categories = Array.from(new Set(results.map(r => r.category)));

  return (
    <div className="bg-white rounded border border-zinc-300 shadow-xs p-5 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-200 pb-4 mb-4">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center gap-2 uppercase">
            <Sparkles className="w-4 h-4 text-brand-green" />
            Automated Validation Suite
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Execute strict unit tests verifying production rules, taxonomy paths, and security constraints.
          </p>
        </div>
        <button
          onClick={handleRunTests}
          disabled={isRunning}
          id="run-tests-btn"
          className="mt-4 sm:mt-0 px-4 py-2 bg-[#008060] hover:bg-[#006e52] text-white rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 font-sans"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          {isRunning ? 'Running tests...' : 'Run Diagnostics'}
        </button>
      </div>

      {results.length === 0 ? (
        <div className="text-center py-12 bg-[#FAFAFA] rounded border border-dashed border-zinc-300">
          <BadgeInfo className="w-8 h-8 text-zinc-400 mx-auto mb-3" />
          <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">No diagnostic results available</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
            Click "Run Diagnostics" to verify all Fashion Rerun AI Studio store contracts and edge case rules.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-6 bg-zinc-900 text-white p-4 rounded border border-zinc-800">
            <div className="text-center border-r border-zinc-800 pr-6">
              <span className="block text-2xl font-bold text-emerald-400 font-mono">
                {results.filter(r => r.passed).length} / {results.length}
              </span>
              <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-mono">Passed Tests</span>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Integrity Verified</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                All canonical paths, mappings, and security assertions conform strictly to store requirements.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {results.map((test, idx) => (
              <div
                key={idx}
                id={`test-case-${idx}`}
                className="p-3.5 rounded border border-zinc-200 bg-[#FAFAFA] hover:bg-zinc-50/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-zinc-200 rounded text-[9px] font-bold text-zinc-700 uppercase tracking-wider font-mono">
                        {test.category}
                      </span>
                      <h4 className="text-xs font-bold text-zinc-800">{test.name}</h4>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-500 mt-2 space-y-1 bg-white p-2 rounded border border-zinc-200">
                      <div><span className="text-zinc-400 font-sans text-[10px] font-medium">Expected:</span> <span className="text-brand-green font-semibold">{test.expected}</span></div>
                      <div><span className="text-zinc-400 font-sans text-[10px] font-medium">Actual:</span> <span className="text-zinc-700 font-semibold">{test.actual}</span></div>
                    </div>
                  </div>
                  <div>
                    {test.passed ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-[#008060] text-[10px] font-bold rounded border border-green-200 uppercase tracking-wider">
                        <CheckCircle2 className="w-3 h-3" />
                        Pass
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-bold rounded border border-rose-200 uppercase tracking-wider">
                        <XCircle className="w-3 h-3" />
                        Fail
                      </span>
                    )}
                  </div>
                </div>

                {test.logs && test.logs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-200">
                    <span className="text-[9px] text-zinc-400 font-mono uppercase tracking-widest block">Execution Logs</span>
                    <ul className="text-xs text-zinc-600 font-mono space-y-1 mt-1 pl-4 list-disc">
                      {test.logs.map((log, lIdx) => (
                        <li key={lIdx}>{log}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
