import React, { useState } from 'react';
import { Search, Download, FileCheck2 } from 'lucide-react';
import { SearchResult } from '../types';
import { api } from '../api';

export const SearchView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try { setResults(await api.searchDocuments(query)); } catch (err: any) { setError(err.message || 'Search failed.'); }
    finally { setLoading(false); }
  };

  const saveBlob = async (blobPromise: Promise<Blob>, filename: string) => {
    const url = URL.createObjectURL(await blobPromise);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="space-y-5">
    <div className="pb-3 border-b border-[#DDD9D1]"><h1 className="text-xl font-bold text-[#0A2540] flex items-center gap-2"><Search className="w-5 h-5 text-[#1F6F4A]" />Document Search &amp; Retrieval</h1><p className="text-xs text-[#5B5B5B] mt-1">Searches authorized document titles, types, and stored text excerpts.</p></div>
    <form onSubmit={runSearch} className="flex gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, document type, or extracted text" className="flex-1 px-3 py-2 text-sm bg-white border border-[#DDD9D1] rounded-[3px]" /><button disabled={loading || !query.trim()} className="px-4 py-2 bg-[#0A2540] text-white text-xs font-semibold rounded-[3px] flex items-center gap-1.5 disabled:opacity-50"><Search className="w-3.5 h-3.5" />Search</button></form>
    {error && <div className="p-3 bg-[#FBEEEE] text-[#8C1D2B] text-xs border border-[#8C1D2B]/30 rounded">{error}</div>}
    <div className="bg-white border border-[#DDD9D1] rounded-[3px] divide-y divide-[#E9E6DF]">{results.length === 0 ? <div className="p-8 text-center text-xs text-[#5B5B5B]">{query ? 'No authorized matches.' : 'Enter a search term to find authorized records.'}</div> : results.map((result) => <div key={result.document_id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><div className="font-semibold text-sm text-[#0A2540]">{result.title}</div><div className="text-[11px] text-[#5B5B5B] mt-1">{result.fir_number} · {result.case_title} · {result.doc_type.replace(/_/g, ' ')}</div>{result.text_excerpt && <div className="text-xs text-[#5B5B5B] mt-2 line-clamp-2">{result.text_excerpt}</div>}</div><div className="flex gap-2 shrink-0"><button onClick={() => saveBlob(api.downloadDocument(result.document_id), result.original_filename || `${result.title}.dat`)} className="px-2.5 py-1.5 border border-[#DDD9D1] text-[#0A2540] text-xs rounded-[3px] flex items-center gap-1"><Download className="w-3.5 h-3.5" />Download</button><button onClick={() => saveBlob(api.downloadSection65BCertificate(result.document_id), `${result.document_id}-section-65b-certificate.txt`)} className="px-2.5 py-1.5 border border-[#1F6F4A]/40 text-[#1F6F4A] text-xs rounded-[3px] flex items-center gap-1"><FileCheck2 className="w-3.5 h-3.5" />65B Certificate</button></div></div>)}</div>
  </div>;
};