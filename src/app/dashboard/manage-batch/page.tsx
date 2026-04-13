'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Filter } from 'lucide-react';
import { usePrograms } from '@/hooks/usePrograms';
import { useLevels } from '@/hooks/useLevels';
import { useBatches } from '@/hooks/useBatches';
import { useAuth } from '@/contexts/AuthContext';
import { useFilter } from '@/contexts/FilterContext';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

export default function ManageBatchPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { programs, loading: programsLoading } = usePrograms();
  const {
    programId: selectedProgramId,
    levelId: selectedLevelId,
    batchId: selectedBatchId,
    handleProgramChange: resetBelowProgram,
    handleLevelChange: resetBelowLevel,
    setBatchId: setSelectedBatchId,
  } = useFilter();
  const { levels, loading: levelsLoading } = useLevels(selectedProgramId || null);
  const { batches, loading: batchesLoading } = useBatches(selectedLevelId || null);

  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  );

  const selectedLevel = useMemo(
    () => levels.find((l) => l.id === selectedLevelId) ?? null,
    [levels, selectedLevelId],
  );

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );

  function handleApply() {
    if (!selectedProgram || !selectedLevel || !selectedBatch) return;
    router.push(
      `/dashboard/master/programs/${selectedProgram.id}/levels/${selectedLevel.id}/batches/${selectedBatch.id}`,
    );
  }

  const loading = programsLoading || levelsLoading || batchesLoading;

  if (user?.role === 'calling_assist') {
    return (
      <div className="glass-card p-8 text-center text-slate-400">
        You do not have access to Manage Batch.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold gradient-text">Manage Batch</h1>
        <p className="text-slate-500 text-sm mt-1">
          Filter by program, level, and batch to load the working sheet.
        </p>
      </div>

      <div className="glass-card p-5 space-y-4 max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            label="Select Program"
            value={selectedProgramId}
            onChange={(e) => resetBelowProgram(e.target.value)}
            placeholder="Choose program"
            options={programs.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Select
            label="Select Level"
            value={selectedLevelId}
            onChange={(e) => resetBelowLevel(e.target.value)}
            placeholder="Choose level"
            disabled={!selectedProgramId}
            options={levels.map((l) => ({ value: l.id, label: l.name }))}
          />
          <Select
            label="Select Batch"
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            placeholder="Choose batch"
            disabled={!selectedLevelId}
            options={batches.map((b) => ({
              value: b.id,
              label: b.batchName ? `${b.batchName} (#${b.batchNumber})` : `Batch ${b.batchNumber}`,
            }))}
          />
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={handleApply} disabled={!selectedBatchId || loading}>
            <Filter size={14} /> Apply & Load Sheet
          </Button>
        </div>
      </div>
    </div>
  );
}
