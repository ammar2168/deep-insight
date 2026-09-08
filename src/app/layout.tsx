import "@/styles/globals.css";

import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
	title: "Deep Insight",
	description:
		"Photograph a page from your journal and surface what it says about your mood, sleep, and progress over time.",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const plexSans = IBM_Plex_Sans({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-plex-mono",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html className={`${plexSans.variable} ${plexMono.variable}`} lang="en">
			<body>
				{/*
				THESIS: Reading a signal off your own handwriting is a sequence worth watching, not a form to submit.
				OWN-WORLD: Orizuru fold sequence — calm aizome-indigo washi ground + numbered margin column (chrome); cream paper card + sumi ink (working surface, where OCR text is actually read and edited by hand); gold marks the locked/saved step. IBM Plex Sans (quiet humanist body/UI) + IBM Plex Mono (tabular step numbers, confidence figures).
				STORY: The user photographs a handwritten page; it enters as one flat sheet, creases through free-text OCR correction, and locks into a standing, saved set of insights the user can view and keep or discard - three real stages carried by the world's numbered-fold-sequence device, not 32 literal folds.
				FIRST VIEWPORT: /capture - a numbered margin rail (Sheet / Crease / Form) beside one continuous panel showing the active stage; upload sits in the flat-sheet stage, primary action bottom-right of the panel.
				FORM: Orizuru Fold Sequence, challenger from concept-seed.mjs --scope direction --mode operate (assigned index 3 of 7; chosen over the assigned Darkroom Proofing on a paper-craft fit for a handwritten-journal audience), seed key ceaa5ff6. Recolored from the original vermilion to a calming indigo per user feedback; material and structure unchanged.
				FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md.
				*/}
				<TRPCReactProvider>{children}</TRPCReactProvider>
			</body>
		</html>
	);
}
