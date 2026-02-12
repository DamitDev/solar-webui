import { useState, useEffect, useCallback, useMemo } from 'react';
import solarClient from '@/api/client';
import { Host, Instance } from '@/api/types';
import { useRoutingEventsContext } from '@/context/RoutingEventsContext';

interface HostWithInstances extends Host {
  instances: Instance[];
}

// --- localStorage helpers for host ordering ---

const HOST_ORDER_KEY = 'solar_host_order';
const INSTANCE_ORDER_KEY_PREFIX = 'solar_instance_order_';

function readHostOrder(): string[] {
  try {
    const raw = localStorage.getItem(HOST_ORDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function writeHostOrder(order: string[]) {
  localStorage.setItem(HOST_ORDER_KEY, JSON.stringify(order));
}

function readInstanceOrder(hostId: string): string[] {
  try {
    const raw = localStorage.getItem(INSTANCE_ORDER_KEY_PREFIX + hostId);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function writeInstanceOrder(hostId: string, order: string[]) {
  localStorage.setItem(INSTANCE_ORDER_KEY_PREFIX + hostId, JSON.stringify(order));
}

/** Sort an array of items by a saved order array. Items not in the saved order appear at the end. */
function applySavedOrder<T extends { id: string }>(items: T[], savedOrder: string[]): T[] {
  if (savedOrder.length === 0) return items;

  const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
  const sorted = [...items].sort((a, b) => {
    const ia = orderMap.get(a.id);
    const ib = orderMap.get(b.id);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return 0; // both unknown – preserve original order
  });
  return sorted;
}

export function useInstances(refreshInterval = 30000) {
  // Increased default to 30s since WebSocket handles real-time updates
  const [hosts, setHosts] = useState<HostWithInstances[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { hostStatuses, routingConnected } = useRoutingEventsContext();

  // Ordering state – triggers re-render when user reorders
  const [hostOrder, setHostOrder] = useState<string[]>(readHostOrder);
  const [instanceOrders, setInstanceOrders] = useState<Record<string, string[]>>(() => {
    // We'll lazily populate per-host orders as needed
    return {};
  });

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      
      // Fetch all hosts
      const hostsData = await solarClient.getHosts();
      
      // Fetch instances for each host
      const hostsWithInstances = await Promise.all(
        hostsData.map(async (host) => {
          try {
            const instances = await solarClient.getHostInstances(host.id);
            return { ...host, instances };
          } catch (err) {
            console.error(`Failed to fetch instances for host ${host.name}:`, err);
            return { ...host, instances: [] };
          }
        })
      );
      
      setHosts(hostsWithInstances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      console.error('Failed to fetch hosts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh at a slower rate (WebSocket handles real-time updates)
  useEffect(() => {
    // If connected via WebSocket, poll less frequently
    const interval = routingConnected ? refreshInterval : 10000;
    const timer = setInterval(fetchData, interval);
    return () => clearInterval(timer);
  }, [fetchData, refreshInterval, routingConnected]);

  const startInstance = useCallback(async (hostId: string, instanceId: string) => {
    try {
      await solarClient.startInstance(hostId, instanceId);
      // Immediate refresh after action
      await fetchData();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to start instance');
    }
  }, [fetchData]);

  const stopInstance = useCallback(async (hostId: string, instanceId: string) => {
    try {
      await solarClient.stopInstance(hostId, instanceId);
      await fetchData();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to stop instance');
    }
  }, [fetchData]);

  const restartInstance = useCallback(async (hostId: string, instanceId: string) => {
    try {
      await solarClient.restartInstance(hostId, instanceId);
      await fetchData();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to restart instance');
    }
  }, [fetchData]);

  // --- Reorder functions ---

  const moveHost = useCallback((hostId: string, direction: 'up' | 'down') => {
    setHostOrder((prev) => {
      // Build a full order list that includes all current hosts
      const currentIds = hosts.map((h) => h.id);
      const fullOrder = applySavedOrder(
        currentIds.map((id) => ({ id })),
        prev
      ).map((x) => x.id);

      const idx = fullOrder.indexOf(hostId);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= fullOrder.length) return prev;

      const newOrder = [...fullOrder];
      [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
      writeHostOrder(newOrder);
      return newOrder;
    });
  }, [hosts]);

  const moveInstance = useCallback((hostId: string, instanceId: string, direction: 'up' | 'down') => {
    setInstanceOrders((prev) => {
      const host = hosts.find((h) => h.id === hostId);
      if (!host) return prev;

      const savedOrder = prev[hostId] ?? readInstanceOrder(hostId);
      const currentIds = host.instances.map((i) => i.id);
      const fullOrder = applySavedOrder(
        currentIds.map((id) => ({ id })),
        savedOrder
      ).map((x) => x.id);

      const idx = fullOrder.indexOf(instanceId);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= fullOrder.length) return prev;

      const newOrder = [...fullOrder];
      [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
      writeInstanceOrder(hostId, newOrder);
      return { ...prev, [hostId]: newOrder };
    });
  }, [hosts]);

  // Merge WebSocket status updates into hosts data, apply saved ordering
  const mergedHosts = useMemo(() => {
    let result = hosts.map((host) => {
      const wsStatus = hostStatuses?.get(host.id);
      const base = wsStatus
        ? {
            ...host,
            status: wsStatus.status as any,
            memory: wsStatus.memory || host.memory,
          }
        : host;

      // Sort instances within this host
      const savedInstanceOrder = instanceOrders[host.id] ?? readInstanceOrder(host.id);
      const sortedInstances = applySavedOrder(base.instances, savedInstanceOrder);

      return { ...base, instances: sortedInstances };
    });

    // Sort hosts by saved order
    result = applySavedOrder(result, hostOrder);

    return result;
  }, [hosts, hostStatuses, hostOrder, instanceOrders]);

  return {
    hosts: mergedHosts,
    loading,
    error,
    refresh: fetchData,
    startInstance,
    stopInstance,
    restartInstance,
    moveHost,
    moveInstance,
  };
}
