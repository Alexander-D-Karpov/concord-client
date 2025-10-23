import React, { useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import Chat from '../components/Chat';
import MemberList from '../components/MemberList';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { Room } from '@/types';

// Convert google.protobuf.Timestamp -> ISO string
const tsToIso = (ts: any): string => {
    if (!ts) return '';
    const seconds = Number(ts.seconds ?? 0);
    const nanos = Number(ts.nanos ?? 0);
    return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
};

const mapRoom = (r: any): Room => ({
    id: r.id,
    name: r.name,
    createdBy: r.created_by,
    voiceServerId: r.voice_server_id || undefined,
    region: r.region || undefined,
    createdAt: tsToIso(r.created_at),
});

const Home: React.FC = () => {
    const { setRooms } = useRoomsStore();
    const { tokens } = useAuthStore();

    const loadRooms = useCallback(async () => {
        try {
            const res = await window.concord.getRooms();
            const rooms: Room[] = (res?.rooms ?? []).map(mapRoom);
            setRooms(rooms);
        } catch (err) {
            console.error('Failed to load rooms:', err);
        }
    }, [setRooms]);

    useEffect(() => {
        if (tokens?.accessToken) {
            loadRooms();
        }
    }, [tokens?.accessToken, loadRooms]);

    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <Chat />
            <MemberList />
        </div>
    );
};

export default Home;