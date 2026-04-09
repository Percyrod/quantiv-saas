'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DeleteSimButton({ simId }: { simId: string }) {
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('¿Eliminar esta simulación?')) return;
    const supabase = createClient();
    await supabase.from('simulations').delete().eq('id', simId);
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      title="Eliminar"
      style={{
        position: 'absolute', top: 10, right: 10,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--t3)', fontSize: 14, padding: '2px 6px',
        borderRadius: 4,
      }}
    >
      ✕
    </button>
  );
}
