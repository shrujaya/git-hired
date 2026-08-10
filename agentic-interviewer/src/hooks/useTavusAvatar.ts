// src/hooks/useTavusAvatar.ts
//
// Live, hands-free conversation with the Tavus avatar.
//
// Tavus owns the voice pipeline: it hears the candidate's microphone, uses
// sparrow-1 turn detection to tell a thinking pause from a finished answer,
// and lets the candidate cut the avatar off mid-sentence (barge-in). Whenever
// a turn completes, Tavus calls our backend's /v1/chat/completions, which
// replies with the InterviewerAgent's next question — so the interview logic
// stays in this repo while the conversational feel comes from Tavus.
//
// That means there is no push-to-talk here: we publish the mic and let Tavus
// decide when the candidate is done.
import { useCallback, useEffect, useRef, useState } from "react";
import Daily, {
  type DailyCall,
  type DailyEventObjectAppMessage,
  type DailyEventObjectTrack,
} from "@daily-co/daily-js";

export type AvatarStatus = "disabled" | "connecting" | "connected" | "error";

export interface AvatarUtterance {
  role: "interviewer" | "candidate";
  text: string;
}

interface TavusAvatarOptions {
  /** Called once per completed utterance, for the on-screen transcript. */
  onUtterance?: (utterance: AvatarUtterance) => void;
}

interface TavusAvatar {
  status: AvatarStatus;
  /** Remote media (avatar video + voice) to attach to a <video>. */
  remoteStream: MediaStream | null;
  /** The avatar is talking. */
  replicaSpeaking: boolean;
  /** The candidate is talking (drives the "listening" indicator). */
  userSpeaking: boolean;
  /** Live partial transcription of the candidate's current sentence. */
  interimSpeech: string;
  micEnabled: boolean;
  toggleMic: () => void;
  /** Cut the avatar off, e.g. when the candidate clicks to interject. */
  interrupt: () => void;
}

export const useTavusAvatar = (
  conversationUrl: string | null,
  conversationId: string | null,
  options: TavusAvatarOptions = {}
): TavusAvatar => {
  const callRef = useRef<DailyCall | null>(null);
  const [status, setStatus] = useState<AvatarStatus>(
    conversationUrl ? "connecting" : "disabled"
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [replicaSpeaking, setReplicaSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [interimSpeech, setInterimSpeech] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);

  // Kept in a ref so changing the callback never tears down the call.
  const onUtteranceRef = useRef(options.onUtterance);
  useEffect(() => {
    onUtteranceRef.current = options.onUtterance;
  }, [options.onUtterance]);

  useEffect(() => {
    if (!conversationUrl) return;

    let cancelled = false;
    const tracks = new Map<string, MediaStreamTrack>();

    const rebuildStream = () => {
      const list = [...tracks.values()];
      setRemoteStream(list.length ? new MediaStream(list) : null);
    };

    const join = async () => {
      // Daily allows a single call object per page. Under StrictMode the
      // effect runs twice on mount, so clear any instance left behind.
      const existing = Daily.getCallInstance();
      if (existing) {
        await existing.destroy();
      }
      if (cancelled) return;

      // Microphone on, camera off: Tavus needs to hear the candidate to do
      // turn detection, but the candidate's own video is rendered locally
      // and the face-tracking feed goes to our backend separately.
      const call = Daily.createCallObject({
        audioSource: true,
        videoSource: false,
        subscribeToTracksAutomatically: true,
      });
      callRef.current = call;

      call.on("track-started", (ev: DailyEventObjectTrack) => {
        if (ev.participant?.local) return;
        tracks.set(ev.track.id, ev.track);
        rebuildStream();
      });

      call.on("track-stopped", (ev: DailyEventObjectTrack) => {
        if (ev.participant?.local) return;
        tracks.delete(ev.track.id);
        rebuildStream();
      });

      call.on("app-message", (ev: DailyEventObjectAppMessage) => {
        const data = ev.data ?? {};
        // Tavus reports the speaker via properties.role; "replica" is the
        // pre-rename value and still appears, so accept both.
        const role = data.properties?.role;
        const isPal = role === "pal" || role === "replica";

        switch (data.event_type) {
          case "conversation.started_speaking":
            if (isPal) setReplicaSpeaking(true);
            else setUserSpeaking(true);
            break;

          case "conversation.stopped_speaking":
            if (isPal) setReplicaSpeaking(false);
            else setUserSpeaking(false);
            break;

          case "conversation.utterance.streaming":
            // Partial candidate speech, shown live then replaced by the final.
            if (!isPal) setInterimSpeech(data.properties?.text ?? "");
            break;

          case "conversation.utterance": {
            const text = (data.properties?.text ?? "").trim();
            if (!isPal) setInterimSpeech("");
            if (text) {
              onUtteranceRef.current?.({
                role: isPal ? "interviewer" : "candidate",
                text,
              });
            }
            break;
          }

          // Legacy event names, kept so a Tavus rollout does not silently
          // break the speaking indicators.
          case "conversation.replica.started_speaking":
            setReplicaSpeaking(true);
            break;
          case "conversation.replica.stopped_speaking":
            setReplicaSpeaking(false);
            break;
        }
      });

      call.on("joined-meeting", () => {
        setStatus("connected");
        setMicEnabled(call.localAudio());
      });
      call.on("left-meeting", () => setStatus("error"));
      call.on("error", (ev) => {
        console.error("Avatar call error:", ev);
        setStatus("error");
      });

      try {
        await call.join({ url: conversationUrl });
      } catch (err) {
        console.error("Failed to join avatar conversation:", err);
        setStatus("error");
      }
    };

    setStatus("connecting");
    join();

    return () => {
      cancelled = true;
      const call = callRef.current;
      callRef.current = null;
      if (call) {
        // leave() before destroy() so the room sees a clean exit.
        call
          .leave()
          .catch(() => {})
          .finally(() => {
            call.destroy().catch(() => {});
          });
      }
    };
  }, [conversationUrl]);

  const toggleMic = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !call.localAudio();
    call.setLocalAudio(next);
    setMicEnabled(next);
  }, []);

  const interrupt = useCallback(() => {
    const call = callRef.current;
    if (!call || !conversationId) return;
    try {
      call.sendAppMessage(
        {
          message_type: "conversation",
          event_type: "conversation.interrupt",
          conversation_id: conversationId,
        },
        "*"
      );
    } catch (err) {
      console.error("Avatar interrupt failed:", err);
    }
  }, [conversationId]);

  return {
    status,
    remoteStream,
    replicaSpeaking,
    userSpeaking,
    interimSpeech,
    micEnabled,
    toggleMic,
    interrupt,
  };
};
