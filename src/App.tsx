import React, { useState, useEffect, useRef } from 'react';
import { Send, Trash2, LogOut, Moon, Sun, Plus, Settings, Image, Users, Link as LinkIcon, X } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut as firebaseSignOut, updateProfile } from 'firebase/auth';
import { getDatabase, ref, push, set, onValue, update, onDisconnect, serverTimestamp, query, orderByChild, limitToLast, remove } from 'firebase/database';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDHIfY-xp98AOYa-4LCETL74tYkIbr85yM",
  authDomain: "chatflow-a8757.firebaseapp.com",
  databaseURL: "https://chatflow-a8757-default-rtdb.firebaseio.com",
  projectId: "chatflow-a8757",
  storageBucket: "chatflow-a8757.firebasestorage.app",
  messagingSenderId: "1060550117723",
  appId: "1:1060550117723:web:16840be80ee539e1b2327e",
  measurementId: "G-HYG5DCKR9H"
};

let app, auth, database, storage;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  database = getDatabase(app);
  storage = getStorage(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
}

interface Message {
  id: string;
  text: string;
  userId: string;
  userName: string;
  userPhoto: string;
  timestamp: number;
  deleted: boolean;
}

interface Chat {
  id: string;
  name: string;
  icon: string;
  createdBy: string;
  members: { [key: string]: boolean };
  inviteCode: string;
  lastMessage?: string;
  lastMessageTime?: number;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChat, setCurrentChat] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showCreateChat, setShowCreateChat] = useState(false);
  const [showEditChat, setShowEditChat] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [editingChatName, setEditingChatName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatIconInputRef = useRef<HTMLInputElement>(null);
  const profilePicInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userData: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          photoURL: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`
        };
        setUser(userData);
        updateOnlineStatus(firebaseUser.uid, true);

        setTimeout(() => setLoading(false), 1500);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (user) {
        updateOnlineStatus(user.uid, false);
      }
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const chatsRef = ref(database, 'chats');
    const unsubscribeChats = onValue(chatsRef, (snapshot) => {
      const chatsList: Chat[] = [];
      snapshot.forEach((child) => {
        const chat = { id: child.key, ...child.val() } as Chat;
        if (chat.members && chat.members[user.uid]) {
          chatsList.push(chat);
        }
      });
      setChats(chatsList);
      if (chatsList.length > 0 && !currentChat) {
        setCurrentChat(chatsList[0].id);
      }
    });

    const onlineRef = ref(database, 'online');
    const unsubscribeOnline = onValue(onlineRef, (snapshot) => {
      setOnlineUsers(snapshot.size);
    });

    return () => {
      unsubscribeChats();
      unsubscribeOnline();
    };
  }, [user]);

  useEffect(() => {
    if (!currentChat) return;

    const messagesRef = ref(database, `messages/${currentChat}`);
    const messagesQuery = query(messagesRef, orderByChild('timestamp'), limitToLast(100));
    const unsubscribeMessages = onValue(messagesQuery, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((child) => {
        msgs.push({ id: child.key, ...child.val() } as Message);
      });
      setMessages(msgs);
    });

    return () => {
      unsubscribeMessages();
    };
  }, [currentChat]);

  const updateOnlineStatus = (uid: string, isOnline: boolean) => {
    const userStatusRef = ref(database, `online/${uid}`);
    if (isOnline) {
      set(userStatusRef, true);
      onDisconnect(userStatusRef).remove();
    } else {
      set(userStatusRef, null);
    }
  };

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const signOut = async () => {
    try {
      if (user) {
        await updateOnlineStatus(user.uid, false);
      }
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const createChat = async () => {
    if (!newChatName.trim() || !user) return;

    const inviteCode = Math.random().toString(36).substring(2, 10);
    const chatData: Omit<Chat, 'id'> = {
      name: newChatName,
      icon: 'https://m.media-amazon.com/images/I/61hOOfrFlBL._UY1000_.jpg',
      createdBy: user.uid,
      members: { [user.uid]: true },
      inviteCode
    };

    try {
      await push(ref(database, 'chats'), chatData);
      setNewChatName('');
      setShowCreateChat(false);
    } catch (error) {
      console.error('Create chat error:', error);
    }
  };

  const joinChatWithLink = async (inviteCode: string) => {
    if (!user) return;

    const chatsRef = ref(database, 'chats');
    onValue(chatsRef, async (snapshot) => {
      snapshot.forEach((child) => {
        const chat = child.val();
        if (chat.inviteCode === inviteCode) {
          update(ref(database, `chats/${child.key}/members`), {
            [user.uid]: true
          });
        }
      });
    }, { onlyOnce: true });
  };

  const updateChatIcon = async (file: File) => {
    if (!currentChat || !file) return;

    try {
      const imageRef = storageRef(storage, `chat-icons/${currentChat}`);
      await uploadBytes(imageRef, file);
      const url = await getDownloadURL(imageRef);
      await update(ref(database, `chats/${currentChat}`), { icon: url });
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  const updateChatName = async () => {
    if (!currentChat || !editingChatName.trim()) return;

    try {
      await update(ref(database, `chats/${currentChat}`), { name: editingChatName });
      setShowEditChat(false);
      setEditingChatName('');
    } catch (error) {
      console.error('Update name error:', error);
    }
  };

  const updateProfilePic = async (file: File) => {
    if (!user || !file) return;

    try {
      const imageRef = storageRef(storage, `profile-pics/${user.uid}`);
      await uploadBytes(imageRef, file);
      const url = await getDownloadURL(imageRef);

      // Update Firebase Auth profile
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { photoURL: url });
      }

      // Update local state
      setUser({ ...user, photoURL: url });
      setShowEditProfile(false);
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  const deleteChat = async (chatId: string) => {
    if (!user) return;

    try {
      await remove(ref(database, `chats/${chatId}`));
      await remove(ref(database, `messages/${chatId}`));
      if (currentChat === chatId) {
        setCurrentChat(chats[0]?.id || null);
      }
    } catch (error) {
      console.error('Delete chat error:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !currentChat) return;

    const message = {
      text: newMessage,
      userId: user.uid,
      userName: user.displayName,
      userPhoto: user.photoURL,
      timestamp: serverTimestamp(),
      deleted: false
    };

    try {
      await push(ref(database, `messages/${currentChat}`), message);
      await update(ref(database, `chats/${currentChat}`), {
        lastMessage: newMessage,
        lastMessageTime: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      console.error('Send message error:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!currentChat) return;
    try {
      await update(ref(database, `messages/${currentChat}/${messageId}`), { deleted: true });
    } catch (error) {
      console.error('Delete message error:', error);
    }
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
           date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const getCurrentChatData = () => {
    return chats.find(c => c.id === currentChat);
  };

  const copyInviteLink = () => {
    const chat = getCurrentChatData();
    if (chat) {
      const link = `${window.location.origin}?invite=${chat.inviteCode}`;
      navigator.clipboard.writeText(link);
      alert('Invite link copied!');
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteCode = urlParams.get('invite');
    if (inviteCode && user) {
      joinChatWithLink(inviteCode);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center chat-container">
        <div className="text-center">
          <img src="https://m.media-amazon.com/images/I/61hOOfrFlBL._UY1000_.jpg" alt="Logo" className="w-24 h-24 mx-auto mb-4 animate-pulse" />
          <div className="w-16 h-1 bg-accent-primary mx-auto rounded-full animate-pulse" style={{ background: 'var(--accent-primary)' }}></div>
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center chat-container">
        <div className="w-full max-w-md p-8">
          <div className="text-center">
            <img src="https://m.media-amazon.com/images/I/61hOOfrFlBL._UY1000_.jpg" alt="Logo" className="w-24 h-24 mx-auto mb-6" />
            <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Piper Chat
            </h1>
            <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
              Fast and secure messaging
            </p>
            <button
              onClick={signInWithGoogle}
              className="w-full py-3 px-6 rounded-xl font-medium text-white transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
              style={{ background: 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)' }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentChatData = getCurrentChatData();

  return (
    <div className="h-screen flex chat-container">
      <div className="w-80 header-bar flex flex-col border-r" style={{ borderColor: 'var(--border-color)' }}>
        <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-color)' }}>
          <img src="https://m.media-amazon.com/images/I/61hOOfrFlBL._UY1000_.jpg" alt="Logo" className="w-10 h-10" />
          <button
            onClick={() => setShowCreateChat(true)}
            className="btn-icon"
            style={{ color: 'var(--accent-primary)' }}
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => setCurrentChat(chat.id)}
              className={`p-4 flex items-center gap-3 cursor-pointer transition-colors ${currentChat === chat.id ? 'bg-tertiary' : ''}`}
              style={{ backgroundColor: currentChat === chat.id ? 'var(--bg-tertiary)' : 'transparent' }}
            >
              <img src={chat.icon} alt={chat.name} className="w-12 h-12 rounded-full" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{chat.name}</h3>
                <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{chat.lastMessage || 'No messages yet'}</p>
              </div>
              {chat.createdBy === user.uid && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this chat?')) deleteChat(chat.id);
                  }}
                  className="p-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="w-10 h-10 rounded-full cursor-pointer"
                onClick={() => setShowEditProfile(true)}
              />
              <div className="online-indicator absolute bottom-0 right-0 border-2" style={{ borderColor: 'var(--bg-secondary)' }}></div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user.displayName}</h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{onlineUsers} online</p>
            </div>
            <button onClick={toggleTheme} className="btn-icon" style={{ color: 'var(--text-secondary)' }}>
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={signOut} className="btn-icon" style={{ color: 'var(--text-secondary)' }}>
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {currentChatData && (
          <header className="header-bar px-4 py-3 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <img src={currentChatData.icon} alt={currentChatData.name} className="w-10 h-10 rounded-full" />
              <h1 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                {currentChatData.name}
              </h1>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={copyInviteLink} className="btn-icon" style={{ color: 'var(--text-secondary)' }}>
                <LinkIcon className="w-5 h-5" />
              </button>
              {currentChatData.createdBy === user.uid && (
                <button onClick={() => { setEditingChatName(currentChatData.name); setShowEditChat(true); }} className="btn-icon" style={{ color: 'var(--text-secondary)' }}>
                  <Settings className="w-5 h-5" />
                </button>
              )}
            </div>
          </header>
        )}

        <main className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide">
          <div className="max-w-4xl mx-auto space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-20">
                <Users className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                <p style={{ color: 'var(--text-secondary)' }}>No messages yet</p>
              </div>
            )}
            {messages.map((msg) => {
              const isOwn = msg.userId === user.uid;
              return (
                <div key={msg.id} className={`flex gap-2 animate-slide-in ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  {!isOwn && <img src={msg.userPhoto} alt={msg.userName} className="w-8 h-8 rounded-full flex-shrink-0 mt-1" />}
                  <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                    {!isOwn && <span className="text-xs font-medium mb-1 px-1" style={{ color: 'var(--accent-primary)' }}>{msg.userName}</span>}
                    <div className={`message-bubble ${isOwn ? 'message-own' : 'message-other'} group`}>
                      {msg.deleted ? (
                        <p className="italic text-sm" style={{ color: 'var(--text-tertiary)' }}>This message was deleted</p>
                      ) : (
                        <>
                          <p className="text-sm leading-relaxed">{msg.text}</p>
                          <span className="message-time">{formatTime(msg.timestamp)}</span>
                        </>
                      )}
                      {isOwn && !msg.deleted && (
                        <button onClick={() => deleteMessage(msg.id)} className="delete-btn absolute -right-8 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </main>

        <div className="input-container p-4 shadow-lg">
          <div className="max-w-4xl mx-auto flex gap-2 items-end">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Message"
              className="input-field flex-1 rounded-3xl px-4 py-3 text-sm resize-none"
            />
            <button onClick={sendMessage} disabled={!newMessage.trim()} className="btn-send rounded-full p-3 text-white shadow-lg">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {showCreateChat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="w-96 rounded-xl p-6" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Create New Chat</h2>
              <button onClick={() => setShowCreateChat(false)} style={{ color: 'var(--text-secondary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              placeholder="Chat name"
              className="input-field w-full rounded-lg px-4 py-2 mb-4"
            />
            <button onClick={createChat} className="w-full py-2 rounded-lg text-white" style={{ background: 'var(--accent-primary)' }}>
              Create
            </button>
          </div>
        </div>
      )}

      {showEditChat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="w-96 rounded-xl p-6" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Edit Chat</h2>
              <button onClick={() => setShowEditChat(false)} style={{ color: 'var(--text-secondary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={editingChatName}
              onChange={(e) => setEditingChatName(e.target.value)}
              placeholder="Chat name"
              className="input-field w-full rounded-lg px-4 py-2 mb-4"
            />
            <button onClick={() => chatIconInputRef.current?.click()} className="w-full py-2 rounded-lg mb-2 flex items-center justify-center gap-2" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
              <Image className="w-4 h-4" /> Change Icon
            </button>
            <input ref={chatIconInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && updateChatIcon(e.target.files[0])} />
            <button onClick={updateChatName} className="w-full py-2 rounded-lg text-white" style={{ background: 'var(--accent-primary)' }}>
              Save
            </button>
          </div>
        </div>
      )}

      {showEditProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="w-96 rounded-xl p-6" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Edit Profile</h2>
              <button onClick={() => setShowEditProfile(false)} style={{ color: 'var(--text-secondary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-center mb-4">
              <img src={user.photoURL} alt={user.displayName} className="w-24 h-24 rounded-full mx-auto mb-4" />
              <button onClick={() => profilePicInputRef.current?.click()} className="py-2 px-4 rounded-lg flex items-center justify-center gap-2 mx-auto" style={{ background: 'var(--accent-primary)', color: 'white' }}>
                <Image className="w-4 h-4" /> Change Photo
              </button>
              <input ref={profilePicInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && updateProfilePic(e.target.files[0])} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
