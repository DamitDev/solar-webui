import { useState, useMemo } from 'react';
import { Instance, InstanceConfig, MemoryInfo, getModelCategory, ModelCategory } from '@/api/types';
import { cn, getStatusColor, formatDate, getMemoryColor, formatMemoryUsage } from '@/lib/utils';
import { InstanceCard } from './InstanceCard';
import { InstanceTable } from './InstanceTable';
import { AddInstanceModal } from './AddInstanceModal';
import { Server, Trash2, Plus, MessageSquare, Brain, Tags, Binary, Search, ChevronUp, ChevronDown } from 'lucide-react';

interface HostCardProps {
  host: {
    id: string;
    name: string;
    url: string;
    api_key: string;
    status: string;
    last_seen?: string;
    memory?: MemoryInfo;
    instances: Instance[];
  };
  index?: number;
  totalHosts?: number;
  viewMode?: 'cards' | 'table';
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveInstanceUp?: (instanceId: string) => void;
  onMoveInstanceDown?: (instanceId: string) => void;
  onStartInstance: (hostId: string, instanceId: string) => Promise<void>;
  onStopInstance: (hostId: string, instanceId: string) => Promise<void>;
  onRestartInstance: (hostId: string, instanceId: string) => Promise<void>;
  onUpdateInstance: (hostId: string, instanceId: string, config: InstanceConfig) => Promise<void>;
  onDeleteInstance: (hostId: string, instanceId: string) => Promise<void>;
  onCreateInstance: (hostId: string, config: InstanceConfig) => Promise<void>;
  onDeleteHost: (hostId: string) => Promise<void>;
}

const CategoryIcon = ({ category, size = 14 }: { category: ModelCategory; size?: number }) => {
  switch (category) {
    case 'generation':
      return <MessageSquare size={size} />;
    case 'classification':
      return <Tags size={size} />;
    case 'embedding':
      return <Binary size={size} />;
    case 'reranker':
      return <Search size={size} />;
    default:
      return <Brain size={size} />;
  }
};

const getCategoryLabel = (category: ModelCategory): string => {
  switch (category) {
    case 'generation':
      return 'Text Gen';
    case 'classification':
      return 'Classifier';
    case 'embedding':
      return 'Embedding';
    case 'reranker':
      return 'Reranker';
    default:
      return category;
  }
};

export function HostCard({
  host,
  index,
  totalHosts,
  viewMode = 'cards',
  onMoveUp,
  onMoveDown,
  onMoveInstanceUp,
  onMoveInstanceDown,
  onStartInstance,
  onStopInstance,
  onRestartInstance,
  onUpdateInstance,
  onDeleteInstance,
  onCreateInstance,
  onDeleteHost,
}: HostCardProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const runningCount = host.instances.filter((i) => i.status === 'running').length;

  // Compute model category counts (generation, embedding, classification, reranker)
  const categoryCounts = useMemo(() => {
    const counts: Record<ModelCategory, { total: number; running: number }> = {
      generation: { total: 0, running: 0 },
      classification: { total: 0, running: 0 },
      embedding: { total: 0, running: 0 },
      reranker: { total: 0, running: 0 },
    };

    for (const instance of host.instances) {
      const category = getModelCategory(instance.config);
      counts[category].total++;
      if (instance.status === 'running') {
        counts[category].running++;
      }
    }

    return counts;
  }, [host.instances]);

  // Filter categories with instances
  const activeCategories = (Object.entries(categoryCounts) as [ModelCategory, { total: number; running: number }][])
    .filter(([, { total }]) => total > 0);

  const isFirst = index === 0;
  const isLast = totalHosts !== undefined && index === totalHosts - 1;

  return (
    <>
    <div className="bg-nord-1 rounded-lg shadow-lg overflow-hidden">
      {/* Host Header */}
      <div className="bg-gradient-to-r from-nord-10 to-nord-9 p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Move up/down buttons */}
            {onMoveUp && onMoveDown && (
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={onMoveUp}
                  disabled={isFirst}
                  className="p-0.5 rounded hover:bg-white hover:bg-opacity-20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-nord-6"
                  title="Move host up"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={onMoveDown}
                  disabled={isLast}
                  className="p-0.5 rounded hover:bg-white hover:bg-opacity-20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-nord-6"
                  title="Move host down"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            )}
            <Server size={24} />
            <div>
              <h2 className="text-xl font-bold text-nord-6">{host.name}</h2>
              <p className="text-sm text-nord-4">{host.url}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium',
                getStatusColor(host.status)
              )}
            >
              {host.status}
            </span>
            <button
              onClick={() => onDeleteHost(host.id)}
              className="p-2 hover:bg-nord-8 hover:bg-opacity-30 rounded transition-colors text-nord-6"
              title="Remove host"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        
        <div className="mt-3 flex items-center justify-between text-sm text-nord-4">
          <div className="flex items-center gap-4">
            <span>
              {runningCount} / {host.instances.length} instances running
            </span>
            {/* Model category summary pills */}
            {activeCategories.length > 0 && (
              <div className="flex items-center gap-2">
                {activeCategories.map(([category, { total, running }]) => (
                  <span
                    key={category}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1',
                      category === 'generation' && 'bg-nord-14 bg-opacity-30 text-nord-14',
                      category === 'classification' && 'bg-nord-13 bg-opacity-30 text-nord-13',
                      category === 'embedding' && 'bg-nord-15 bg-opacity-30 text-nord-15',
                      category === 'reranker' && 'bg-nord-12 bg-opacity-30 text-nord-12'
                    )}
                    title={`${getCategoryLabel(category)}: ${running}/${total}`}
                  >
                    <CategoryIcon category={category} />
                    <span>{running}/{total}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {host.last_seen && <span>Last seen: {formatDate(host.last_seen)}</span>}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-3 py-1 bg-nord-6 hover:bg-nord-5 rounded transition-colors text-sm font-medium text-nord-0 shadow-md"
              title="Add instance"
            >
              <Plus size={16} />
              Add Instance
            </button>
          </div>
        </div>

        {/* Memory Usage */}
        {host.memory && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs text-nord-4">
              <span className="font-medium">{host.memory.memory_type} Usage:</span>
              <span>{formatMemoryUsage(host.memory.used_gb, host.memory.total_gb, host.memory.percent)}</span>
            </div>
            <div className="w-full h-2 bg-nord-2 rounded-full overflow-hidden">
              <div
                className={cn("h-full transition-all duration-300 rounded-full", getMemoryColor(host.memory.percent))}
                style={{ width: `${Math.min(host.memory.percent, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Instances */}
      <div className="p-4">
        {host.instances.length === 0 ? (
          <div className="text-center py-8 text-nord-4">
            <p>No instances configured</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-6 py-3 bg-nord-10 text-nord-6 rounded-lg hover:bg-nord-9 transition-colors font-medium shadow-md"
            >
              <Plus size={20} className="inline-block mr-2" />
              Add First Instance
            </button>
          </div>
        ) : viewMode === 'table' ? (
          <InstanceTable
            instances={host.instances}
            hostId={host.id}
            onStart={onStartInstance}
            onStop={onStopInstance}
            onRestart={onRestartInstance}
            onUpdate={onUpdateInstance}
            onDelete={onDeleteInstance}
            onMoveUp={onMoveInstanceUp}
            onMoveDown={onMoveInstanceDown}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {host.instances.map((instance, idx) => (
              <div key={instance.id} className="relative">
                {/* Instance move buttons (card view) */}
                {onMoveInstanceUp && onMoveInstanceDown && (
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 -translate-x-full flex flex-col gap-0.5 z-10">
                    <button
                      onClick={() => onMoveInstanceUp(instance.id)}
                      disabled={idx === 0}
                      className="p-0.5 rounded bg-nord-3 hover:bg-nord-10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-nord-4 hover:text-nord-6"
                      title="Move instance up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => onMoveInstanceDown(instance.id)}
                      disabled={idx === host.instances.length - 1}
                      className="p-0.5 rounded bg-nord-3 hover:bg-nord-10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-nord-4 hover:text-nord-6"
                      title="Move instance down"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                )}
                <InstanceCard
                  instance={instance}
                  hostId={host.id}
                  onStart={onStartInstance}
                  onStop={onStopInstance}
                  onRestart={onRestartInstance}
                  onUpdate={onUpdateInstance}
                  onDelete={onDeleteInstance}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Add Instance Modal */}
    {showAddModal && (
      <AddInstanceModal
        hostId={host.id}
        hostName={host.name}
        onClose={() => setShowAddModal(false)}
        onCreate={onCreateInstance}
      />
    )}
    </>
  );
}
