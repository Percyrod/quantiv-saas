import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import SimulatorClient from '@/components/SimulatorClient';

export default async function ViewSimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: sim } = await supabase
    .from('simulations')
    .select('*')
    .eq('id', id)
    .single();

  if (!sim) notFound();

  return <SimulatorClient initialParams={sim.params} simName={sim.name} simId={sim.id} />;
}
