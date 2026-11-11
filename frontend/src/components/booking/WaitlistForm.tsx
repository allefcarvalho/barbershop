import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { BellRing, Check } from 'lucide-react';
import { api, pub, apiErrorMessage } from '../../config/api';

/** "Avise-me se abrir horário": entra na lista de espera do dia e recebe aviso no WhatsApp. */
export function WaitlistForm({ serviceId, barberId, date }: { serviceId: string; barberId?: string; date: string }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [accept, setAccept] = useState(false);
  const join = useMutation({
    mutationFn: () => api.post(pub('/waitlist'), { clientName: name, clientPhone: phone, serviceId, barberId, date, acceptTerms: true }),
  });

  if (join.isSuccess) {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-green-400 font-body py-4">
        <Check className="w-4 h-4" /> Pronto! Avisamos no seu WhatsApp se abrir um horário neste dia.
      </p>
    );
  }

  const input = 'w-full px-4 py-3 bg-dark border border-white/10 rounded-lg text-white placeholder-[#5A5650] focus:border-brand-500/40 focus:outline-none font-body text-sm';
  return (
    <form
      className="max-w-md mx-auto mt-4 p-5 rounded-xl border border-brand-500/20 bg-brand-500/5 space-y-3"
      onSubmit={(e) => { e.preventDefault(); join.mutate(); }}
    >
      <p className="flex items-center gap-2 text-sm text-white font-body"><BellRing className="w-4 h-4 text-brand-400" /> Quer ser avisado se alguém cancelar?</p>
      <input className={input} placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" aria-label="Seu nome" />
      <input className={input} type="tel" placeholder="WhatsApp com DDD" value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" aria-label="WhatsApp" />
      <label className="flex items-start gap-2 text-xs text-[#8A8680] font-body cursor-pointer">
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#C9A96E]" />
        <span>Aceito a <Link to="/privacidade" target="_blank" className="text-brand-400 underline">política de privacidade</Link> e receber o aviso no WhatsApp.</span>
      </label>
      {join.error && <p className="text-xs text-red-400 font-body">{apiErrorMessage(join.error)}</p>}
      <button
        type="submit"
        disabled={!accept || name.length < 2 || phone.replace(/\D/g, '').length < 10 || join.isPending}
        className="w-full px-4 py-2.5 text-xs font-semibold uppercase tracking-wider bg-brand-500 text-dark rounded-lg disabled:opacity-50 font-body"
      >
        Me avise
      </button>
    </form>
  );
}
