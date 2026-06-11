import { useChat } from 'ai/react';

export function SupportChat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({ api: '/api/chat' });
  return (
    <div id="chat-widget">
      {messages.map((m) => (
        <p key={m.id}>{m.content}</p>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} placeholder="Ask us anything" />
      </form>
    </div>
  );
}
