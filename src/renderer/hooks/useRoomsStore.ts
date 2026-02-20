import { create } from 'zustand';
import { Room, Member, RoomInvite } from '../types';

interface RoomsState {
    rooms: Room[];
    currentRoomId: string | null;
    members: Record<string, Member[]>;
    roomInvites: RoomInvite[];
    setRooms: (rooms: Room[]) => void;
    addRoom: (room: Room) => void;
    updateRoom: (room: Room) => void;
    removeRoom: (roomId: string) => void;
    setCurrentRoom: (roomId: string | null) => void;
    setMembers: (roomId: string, members: Member[]) => void;
    updateMemberReadStatus: (roomId: string, userId: string, messageId: string) => void;
    setRoomInvites: (invites: RoomInvite[]) => void;
}

export const useRoomsStore = create<RoomsState>((set) => ({
    rooms: [],
    currentRoomId: null,
    members: {},
    roomInvites: [],

    setRooms: (rooms) => set({ rooms }),

    addRoom: (room) => set((state) => ({ rooms: [...state.rooms, room] })),

    updateRoom: (room) =>
        set((state) => ({
            rooms: state.rooms.map((r) => (r.id === room.id ? { ...r, ...room } : r)),
        })),

    removeRoom: (roomId) =>
        set((state) => ({
            rooms: state.rooms.filter((r) => r.id !== roomId),
            currentRoomId: state.currentRoomId === roomId ? null : state.currentRoomId,
        })),

    setCurrentRoom: (roomId) => set({ currentRoomId: roomId }),

    setMembers: (roomId, members) =>
        set((state) => ({ members: { ...state.members, [roomId]: members } })),

    updateMemberReadStatus: (roomId, userId, messageId) => set((state) => {
        const roomMembers = state.members[roomId] || [];
        return {
            members: {
                ...state.members,
                [roomId]: roomMembers.map(m =>
                    m.userId === userId ? { ...m, lastReadMessageId: messageId } : m
                )
            }
        };
    }),

    setRoomInvites: (invites) => set({ roomInvites: invites }),
}));