import { create } from 'zustand';
import { Room, Member } from '../types';

interface RoomsState {
    rooms: Room[];
    currentRoomId: string | null;
    members: Record<string, Member[]>;
    setRooms: (rooms: Room[]) => void;
    addRoom: (room: Room) => void;
    setCurrentRoom: (roomId: string | null) => void;
    setMembers: (roomId: string, members: Member[]) => void;
}

export const useRoomsStore = create<RoomsState>((set) => ({
    rooms: [],
    currentRoomId: null,
    members: {},
    setRooms: (rooms) => set({ rooms }),
    addRoom: (room) => set((state) => ({ rooms: [...state.rooms, room] })),
    setCurrentRoom: (roomId) => set({ currentRoomId: roomId }),
    setMembers: (roomId, members) =>
        set((state) => ({
            members: { ...state.members, [roomId]: members },
        })),
}));