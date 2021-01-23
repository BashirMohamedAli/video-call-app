import React, { Component } from "react";

import io from "socket.io-client";

import Video from "./components/video";
import Videos from "./components/videos";

import Draggable from "./components/draggable";

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      localStream: null,
      remoteStream: null,
      remoteStreams: [],
      peerConnections: {},
      selectedVideo: null,

      status: "fadlan sug qof kale...",

      pc_config: {
        iceServers: [
          {
            urls: "stun:stun.l.google.com:19302",
          },
        ],
      },

      sdpConstraints: {
        mandatory: {
          OfferToReceiveAudio: true,
          OfferToReceiveVideo: true,
        },
      },

      messages: [],
      sendChannels: [],
      disconnected: false,
    };

    this.serviceIP = "https://925e24a153d1.ngrok.io/webrtcPeer";

    this.socket = null;
  }

  getLocalStream = () => {
    const success = (stream) => {
      window.localStream = stream;

      this.setState({
        localStream: stream,
      });

      this.whoisOnline();
    };

    const failure = (e) => {
      console.log("getUserMedia Error: ", e);
    };

    const constraints = {
      audio: true,
      video: true,
      options: {
        mirror: true,
      },
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(success)
      .catch(failure);
  };

  whoisOnline = () => {
    this.sendToPeer("onlinePeers", null, { local: this.socket.id });
  };

  sendToPeer = (messageType, payload, socketID) => {
    this.socket.emit(messageType, {
      socketID,
      payload,
    });
  };

  createPeerConnection = (socketID, callback) => {
    try {
      let pc = new RTCPeerConnection(this.state.pc_config);

      const peerConnections = { ...this.state.peerConnections, [socketID]: pc };
      this.setState({
        peerConnections,
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.sendToPeer("candidate", e.candidate, {
            local: this.socket.id,
            remote: socketID,
          });
        }
      };

      pc.oniceconnectionstatechange = (e) => {};

      pc.ontrack = (e) => {
        let _remoteStream = null;
        let remoteStreams = this.state.remoteStreams;
        let remoteVideo = {};

        const rVideos = this.state.remoteStreams.filter(
          (stream) => stream.id === socketID
        );

        if (rVideos.length) {
          _remoteStream = rVideos[0].stream;
          _remoteStream.addTrack(e.track, _remoteStream);

          remoteVideo = {
            ...rVideos[0],
            stream: _remoteStream,
          };
          remoteStreams = this.state.remoteStreams.map((_remoteVideo) => {
            return (
              (_remoteVideo.id === remoteVideo.id && remoteVideo) ||
              _remoteVideo
            );
          });
        } else {
          _remoteStream = new MediaStream();
          _remoteStream.addTrack(e.track, _remoteStream);

          remoteVideo = {
            id: socketID,
            name: socketID,
            stream: _remoteStream,
          };
          remoteStreams = [...this.state.remoteStreams, remoteVideo];
        }

        this.setState((prevState) => {
          const remoteStream =
            prevState.remoteStreams.length > 0
              ? {}
              : { remoteStream: _remoteStream };

          let selectedVideo = prevState.remoteStreams.filter(
            (stream) => stream.id === prevState.selectedVideo.id
          );
          selectedVideo = selectedVideo.length
            ? {}
            : { selectedVideo: remoteVideo };

          return {
            ...selectedVideo,

            ...remoteStream,
            remoteStreams,
          };
        });
      };

      pc.close = () => {
        console.log("pc closed");
      };

      if (this.state.localStream)
        this.state.localStream.getTracks().forEach((track) => {
          pc.addTrack(track, this.state.localStream);
        });

      callback(pc);
    } catch (e) {
      console.log("Something went wrong! pc not created!!", e);

      callback(null);
    }
  };

  componentDidMount = () => {
    this.socket = io.connect(this.serviceIP, {
      path: "/io/webrtc",
      query: {
        room: window.location.pathname,
      },
    });

    this.socket.on("connection-success", (data) => {
      this.getLocalStream();

      const status =
        data.peerCount > 1
          ? `Dhamaan inta ku xiran qolka ${window.location.pathname}: ${data.peerCount}`
          : "sug dad kale";

      this.setState({
        status: status,
        messages: data.messages,
      });
    });

    this.socket.on("joined-peers", (data) => {
      this.setState({
        status:
          data.peerCount > 1
            ? `Dhamaan inta ku xiran qolka ${window.location.pathname}: ${data.peerCount}`
            : "sug dad kale",
      });
    });

    this.socket.on("peer-disconnected", (data) => {
      this.state.peerConnections[data.socketID].close();

      const rVideo = this.state.remoteStreams.filter(
        (stream) => stream.id === data.socketID
      );
      rVideo && this.stopTracks(rVideo[0].stream);

      const remoteStreams = this.state.remoteStreams.filter(
        (stream) => stream.id !== data.socketID
      );

      this.setState((prevState) => {
        const selectedVideo =
          prevState.selectedVideo.id === data.socketID && remoteStreams.length
            ? { selectedVideo: remoteStreams[0] }
            : null;

        return {
          remoteStreams,
          ...selectedVideo,
          status:
            data.peerCount > 1
              ? `Dhamaan inta ku xiran qolka ${window.location.pathname}: ${data.peerCount}`
              : "sug dad kale",
        };
      });
    });

    this.socket.on("online-peer", (socketID) => {
      this.createPeerConnection(socketID, (pc) => {
        if (pc) {
          const handleSendChannelStatusChange = (event) => {
            console.log(
              "send channel status: " + this.state.sendChannels[0].readyState
            );
          };

          const sendChannel = pc.createDataChannel("sendChannel");
          sendChannel.onopen = handleSendChannelStatusChange;
          sendChannel.onclose = handleSendChannelStatusChange;

          this.setState((prevState) => {
            return {
              sendChannels: [...prevState.sendChannels, sendChannel],
            };
          });

          const handleReceiveMessage = (event) => {
            const message = JSON.parse(event.data);

            this.setState((prevState) => {
              return {
                messages: [...prevState.messages, message],
              };
            });
          };

          const handleReceiveChannelStatusChange = (event) => {
            if (this.receiveChannel) {
              console.log(
                "receive channel's status has changed to " +
                  this.receiveChannel.readyState
              );
            }
          };

          const receiveChannelCallback = (event) => {
            const receiveChannel = event.channel;
            receiveChannel.onmessage = handleReceiveMessage;
            receiveChannel.onopen = handleReceiveChannelStatusChange;
            receiveChannel.onclose = handleReceiveChannelStatusChange;
          };

          pc.ondatachannel = receiveChannelCallback;

          pc.createOffer(this.state.sdpConstraints).then((sdp) => {
            pc.setLocalDescription(sdp);

            this.sendToPeer("offer", sdp, {
              local: this.socket.id,
              remote: socketID,
            });
          });
        }
      });
    });

    this.socket.on("offer", (data) => {
      this.createPeerConnection(data.socketID, (pc) => {
        pc.addStream(this.state.localStream);

        const handleSendChannelStatusChange = (event) => {
          console.log(
            "send channel status: " + this.state.sendChannels[0].readyState
          );
        };

        const sendChannel = pc.createDataChannel("sendChannel");
        sendChannel.onopen = handleSendChannelStatusChange;
        sendChannel.onclose = handleSendChannelStatusChange;

        this.setState((prevState) => {
          return {
            sendChannels: [...prevState.sendChannels, sendChannel],
          };
        });

        // Receive Channels
        const handleReceiveMessage = (event) => {
          const message = JSON.parse(event.data);

          this.setState((prevState) => {
            return {
              messages: [...prevState.messages, message],
            };
          });
        };

        const handleReceiveChannelStatusChange = (event) => {
          if (this.receiveChannel) {
            console.log(
              "receive channel's status has changed to " +
                this.receiveChannel.readyState
            );
          }
        };

        const receiveChannelCallback = (event) => {
          const receiveChannel = event.channel;
          receiveChannel.onmessage = handleReceiveMessage;
          receiveChannel.onopen = handleReceiveChannelStatusChange;
          receiveChannel.onclose = handleReceiveChannelStatusChange;
        };

        pc.ondatachannel = receiveChannelCallback;

        pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(
          () => {
            pc.createAnswer(this.state.sdpConstraints).then((sdp) => {
              pc.setLocalDescription(sdp);

              this.sendToPeer("answer", sdp, {
                local: this.socket.id,
                remote: data.socketID,
              });
            });
          }
        );
      });
    });

    this.socket.on("answer", (data) => {
      const pc = this.state.peerConnections[data.socketID];

      pc.setRemoteDescription(
        new RTCSessionDescription(data.sdp)
      ).then(() => {});
    });

    this.socket.on("candidate", (data) => {
      const pc = this.state.peerConnections[data.socketID];

      if (pc) pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    });
  };

  disconnectSocket = (socketToDisconnect) => {
    this.sendToPeer("socket-to-disconnect", null, {
      local: this.socket.id,
      remote: socketToDisconnect,
    });
  };

  switchVideo = (_video) => {
    this.setState({
      selectedVideo: _video,
    });
  };

  stopTracks = (stream) => {
    stream.getTracks().forEach((track) => track.stop());
  };

  render() {
    const {
      status,
      messages,
      disconnected,
      localStream,
      peerConnections,
      remoteStreams,
    } = this.state;

    if (disconnected) {
      this.socket.close();

      this.stopTracks(localStream);

      remoteStreams.forEach((rVideo) => this.stopTracks(rVideo.stream));

      peerConnections &&
        Object.values(peerConnections).forEach((pc) => pc.close());

      return <div>successfully Disconnected</div>;
    }

    const statusText = (
      <div style={{ color: "yellow", padding: 5 }}>{status}</div>
    );

    return (
      <div>
        <Draggable
          style={{
            zIndex: 101,
            position: "absolute",
            right: 0,
            cursor: "move",
          }}
        >
          <Video
            videoType="localVideo"
            videoStyles={{
              width: 200,
            }}
            frameStyle={{
              width: 200,
              margin: 5,
              borderRadius: 5,
              backgroundColor: "black",
            }}
            showMuteControls={true}
            videoStream={localStream}
            autoPlay
            muted
          ></Video>
        </Draggable>
        <br />
        <div
          style={{
            zIndex: 3,
            position: "absolute",
          }}
        >
          <i
            onClick={(e) => {
              this.setState({ disconnected: true });
            }}
            style={{ cursor: "pointer", paddingLeft: 15, color: "red" }}
            class="material-icons"
          >
            ka bax
          </i>
          <div
            style={{
              margin: 10,
              padding: 10,
              borderRadius: 5,
            }}
          >
            {statusText}
          </div>
        </div>
        <div>
          <Videos
            switchVideo={this.switchVideo}
            remoteStreams={remoteStreams}
          ></Videos>
        </div>
      </div>
    );
  }
}

export default App;
