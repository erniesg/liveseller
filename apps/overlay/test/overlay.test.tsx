// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { validOverlayState } from "@liveseller/contracts";
import { App, formatCountdown } from "../src/App";

describe("public overlay", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders product, promo, quantity, countdown, and multilingual captions", () => {
    render(<App state={validOverlayState} now={new Date("2026-06-06T03:55:00.000Z")} />);

    expect(screen.getByText("Bamboo Cooling Tee")).toBeInTheDocument();
    expect(screen.getByText(/SGD 19.90/)).toBeInTheDocument();
    expect(screen.getByText(/42 left/)).toBeInTheDocument();
    expect(screen.getByText("Live Flash 10% Off")).toBeInTheDocument();
    expect(screen.getByText("50 claims left")).toBeInTheDocument();
    expect(screen.getByText("Overlay-only")).toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByText(validOverlayState.caption.text)).toBeInTheDocument();
    expect(screen.getByText(validOverlayState.translatedCaptions[0]!.text)).toBeInTheDocument();
  });

  it("keeps long captions in caption containers without warning in the valid fixture", () => {
    render(<App state={validOverlayState} />);
    expect(validOverlayState.layoutWarnings).toEqual([]);
    expect(screen.getByLabelText("Live captions")).toHaveClass("caption-band");
  });

  it("formats promo countdowns deterministically", () => {
    expect(
      formatCountdown("2026-06-06T04:00:00.000Z", new Date("2026-06-06T03:58:30.000Z"))
    ).toBe("01:30");
  });

  it("starts a realtime translation WebRTC call and renders transcript deltas", async () => {
    const emptyCaptionState = {
      ...validOverlayState,
      caption: {
        ...validOverlayState.caption,
        text: "",
        visible: false
      },
      translatedCaptions: []
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/runtime/realtime-translation/session")) {
        return new Response(JSON.stringify({ value: "ephemeral-client-secret" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url === "https://api.openai.com/v1/realtime/translations/calls") {
        return new Response("answer-sdp", {
          status: 200,
          headers: { "content-type": "application/sdp" }
        });
      }
      return new Response(JSON.stringify(emptyCaptionState), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const localTrack = { stop: vi.fn() };
    const localStream = {
      getAudioTracks: () => [localTrack],
      getTracks: () => [localTrack]
    };
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => localStream)
      }
    });

    const audioPlayMock = vi.fn(async () => undefined);
    class FakeAudio {
      autoplay = false;
      controls = false;
      muted = false;
      style = { display: "" };
      srcObject: unknown = null;
      volume = 1;
      pause = vi.fn();
      play = audioPlayMock;
      remove = vi.fn();
      setAttribute = vi.fn();
    }
    const audioElement = new FakeAudio();
    const appendMock = vi.spyOn(document.body, "append").mockImplementation(() => undefined);
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "audio") {
        return audioElement as unknown as HTMLElement;
      }
      return originalCreateElement(tagName);
    });

    let dataChannel:
      | {
          onmessage: ((event: { data: string }) => void) | null;
        }
      | undefined;
    let peer:
      | {
          ontrack: ((event: { streams: unknown[] }) => void) | null;
          addTrack: ReturnType<typeof vi.fn>;
          setRemoteDescription: ReturnType<typeof vi.fn>;
        }
      | undefined;
    class FakeRTCPeerConnection {
      ontrack: ((event: { streams: unknown[] }) => void) | null = null;
      addTrack = vi.fn();
      close = vi.fn();
      createDataChannel = vi.fn(() => {
        dataChannel = { onmessage: null };
        return dataChannel;
      });
      createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" }));
      setLocalDescription = vi.fn(async () => undefined);
      setRemoteDescription = vi.fn(async () => undefined);

      constructor() {
        peer = this;
      }
    }
    vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);

    render(<App enableLiveControls runtimeBaseUrl="http://runtime.test" />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).endsWith("/api/runtime/realtime-translation/session")
        )
      ).toHaveLength(1);
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url) === "https://api.openai.com/v1/realtime/translations/calls"
        )
      ).toHaveLength(1);
    });
    expect(peer?.addTrack).toHaveBeenCalledWith(localTrack, localStream);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        latency: { ideal: 0 },
        noiseSuppression: false
      }
    });
    const sessionRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/runtime/realtime-translation/session")
    );
    expect(JSON.parse(String(sessionRequest?.[1]?.body))).toEqual({
      sourceLanguage: "en",
      targetLanguage: "ms"
    });
    expect(peer?.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "answer-sdp"
    });
    expect(screen.getByText("Speak now")).toBeInTheDocument();

    act(() => {
      dataChannel?.onmessage?.({
        data: JSON.stringify({
          type: "session.input_transcript.delta",
          delta: "Hello "
        })
      });
      dataChannel?.onmessage?.({
        data: JSON.stringify({
          type: "session.input_transcript.delta",
          delta: "live"
        })
      });
      dataChannel?.onmessage?.({
        data: JSON.stringify({
          type: "session.output_transcript.delta",
          delta: "Helo "
        })
      });
      dataChannel?.onmessage?.({
        data: JSON.stringify({
          type: "session.output_transcript.delta",
          delta: "siaran langsung"
        })
      });
      peer?.ontrack?.({ streams: [{ id: "remote-translated-audio" }] });
    });

    expect(screen.getByText("Hello live")).toBeInTheDocument();
    expect(screen.getByText("Helo siaran langsung")).toBeInTheDocument();
    expect(appendMock).toHaveBeenCalledWith(audioElement);
    expect(audioElement).toMatchObject({
      autoplay: true,
      muted: false,
      srcObject: { id: "remote-translated-audio" },
      volume: 1
    });
    expect(audioElement.setAttribute).toHaveBeenCalledWith("playsinline", "true");
    expect(audioPlayMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Translated audio"));
    expect(audioElement).toMatchObject({
      muted: true,
      volume: 0
    });

    act(() => {
      dataChannel?.onmessage?.({
        data: JSON.stringify({
          type: "session.output_transcript.delta",
          delta: ". Ini terjemahan yang lebih baru untuk diselaraskan dengan audio langsung"
        })
      });
    });

    expect(screen.queryByText("Helo siaran langsung")).not.toBeInTheDocument();
    expect(screen.getByText("lebih baru untuk diselaraskan dengan audio langsung")).toBeInTheDocument();
  });
});
