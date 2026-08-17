import { Suspense } from "react";

import { ChatView } from "@/app/_components/chat-view";

export default function ChatPage() {
	return (
		<Suspense fallback={null}>
			<ChatView />
		</Suspense>
	);
}
