import { openDB, type IDBPDatabase } from 'idb';

export interface ChatMessage {
  id: string;
  chatId: string;
  from: string;
  to: string;
  text: string;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
  // Photo support
  image?: string; // base64 data URL
  imageWidth?: number;
  imageHeight?: number;
}

export interface Contact {
  peerId: string;
  name: string;
  addedAt: number;
  lastSeen?: number;
  avatar?: string;
}

export interface UserProfile {
  peerId: string;
  name: string;
  createdAt: number;
  avatar?: string;
}

// Group chat
export interface GroupChat {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;
  members: string[]; // peer IDs
  avatar?: string;
}

const DB_NAME = 'denchat-db';
const DB_VERSION = 2;

let dbInstance: IDBPDatabase | null = null;

export async function getDB() {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Messages store
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('byChatId', 'chatId');
        msgStore.createIndex('byTimestamp', 'timestamp');
      }
      // Contacts store
      if (!db.objectStoreNames.contains('contacts')) {
        db.createObjectStore('contacts', { keyPath: 'peerId' });
      }
      // Profile store
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'peerId' });
      }
      // Groups store (added in v2)
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('groups')) {
          db.createObjectStore('groups', { keyPath: 'id' });
        }
      }
    },
  });

  return dbInstance;
}

// Profile
export async function saveProfile(profile: UserProfile) {
  const db = await getDB();
  await db.put('profile', profile);
}

export async function getProfile(): Promise<UserProfile | undefined> {
  const db = await getDB();
  const all = await db.getAll('profile');
  return all[0];
}

// Contacts
export async function saveContact(contact: Contact) {
  const db = await getDB();
  await db.put('contacts', contact);
}

export async function getContacts(): Promise<Contact[]> {
  const db = await getDB();
  return db.getAll('contacts');
}

export async function deleteContact(peerId: string) {
  const db = await getDB();
  await db.delete('contacts', peerId);
}

// Messages
export async function saveMessage(message: ChatMessage) {
  const db = await getDB();
  await db.put('messages', message);
}

export async function getMessagesByChatId(chatId: string): Promise<ChatMessage[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('messages', 'byChatId', chatId);
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getAllMessages(): Promise<ChatMessage[]> {
  const db = await getDB();
  return db.getAll('messages');
}

export async function deleteMessagesByChatId(chatId: string) {
  const db = await getDB();
  const messages = await db.getAllFromIndex('messages', 'byChatId', chatId);
  const tx = db.transaction('messages', 'readwrite');
  for (const msg of messages) {
    await tx.store.delete(msg.id);
  }
  await tx.done;
}

// Delete profile (full reset)
export async function deleteProfile() {
  const db = await getDB();
  // Clear all stores
  const txProfile = db.transaction('profile', 'readwrite');
  await txProfile.store.clear();
  await txProfile.done;

  const txContacts = db.transaction('contacts', 'readwrite');
  await txContacts.store.clear();
  await txContacts.done;

  const txMessages = db.transaction('messages', 'readwrite');
  await txMessages.store.clear();
  await txMessages.done;

  const txGroups = db.transaction('groups', 'readwrite');
  await txGroups.store.clear();
  await txGroups.done;
}

// Groups
export async function saveGroup(group: GroupChat) {
  const db = await getDB();
  await db.put('groups', group);
}

export async function getGroups(): Promise<GroupChat[]> {
  const db = await getDB();
  return db.getAll('groups');
}

export async function getGroup(id: string): Promise<GroupChat | undefined> {
  const db = await getDB();
  return db.get('groups', id);
}

export async function deleteGroup(id: string) {
  const db = await getDB();
  await db.delete('groups', id);
  // Also delete group messages
  await deleteMessagesByChatId(id);
}

export async function updateGroupMembers(id: string, members: string[]) {
  const db = await getDB();
  const group = await db.get('groups', id);
  if (group) {
    group.members = members;
    await db.put('groups', group);
  }
}
