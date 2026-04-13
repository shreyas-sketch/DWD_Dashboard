'use client';

import React, { createContext, useContext, useState } from 'react';

interface FilterState {
  programId: string;
  levelId: string;
  batchId: string;
}

interface FilterContextValue extends FilterState {
  setProgramId: (id: string) => void;
  setLevelId: (id: string) => void;
  setBatchId: (id: string) => void;
  /** Change program and reset downstream selections */
  handleProgramChange: (id: string) => void;
  /** Change level and reset batch selection */
  handleLevelChange: (id: string) => void;
  /** Clear all filter selections */
  clearFilters: () => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [programId, setProgramId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [batchId, setBatchId] = useState('');

  function handleProgramChange(id: string) {
    setProgramId(id);
    setLevelId('');
    setBatchId('');
  }

  function handleLevelChange(id: string) {
    setLevelId(id);
    setBatchId('');
  }

  function clearFilters() {
    setProgramId('');
    setLevelId('');
    setBatchId('');
  }

  return (
    <FilterContext.Provider
      value={{
        programId,
        levelId,
        batchId,
        setProgramId,
        setLevelId,
        setBatchId,
        handleProgramChange,
        handleLevelChange,
        clearFilters,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be used within FilterProvider');
  return ctx;
}
