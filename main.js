import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import './style.css'


const firebaseConfig = {
  apiKey: process.env.API_KEY,
  authDomain: process.env.AUTH_DOMAIN,
  projectId: process.env.PROJECT_ID,
  storageBucket: process.env.STORAGE_BUCKET,
  messagingSenderId: process.env.MESSAGE_SENDER_ID,
  appId: process.env.APP_ID,
  measurementId: process.env.MEASUREMENT_ID,
};


if (!firebase?.apps?.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();


const configuration = {
  iceServers:
    [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun2.1.google.com:19302']
      }
    ],
  iceCandidatePoolSize: 10
}

const peerConnection = new RTCPeerConnection(configuration)
let localStream = null;  // yours
let remoteStream = null; // theres


// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');


// 1. setup media sources
webcamButton.onclick = async () => {
  console.log("started video");
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  }) 
  remoteStream = new MediaStream()

  // push tracks from localStream to peerConnection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream)
  })


  // pull tracks from remote stream, then add it to video stream
  peerConnection.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track)
    })
  }

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;
  
  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
}


// 2. Create on offer
callButton.onclick = async () => {
  console.log("click on offer");

  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  console.log("CallInput", callInput);

  // get candidates for caller, save to db
  peerConnection.onicecandidate = event => {
    event.candidate && offerCandidates.add(event.candidate.toJSON())
  }


  //2.  create offer
  const offerDescription = await peerConnection.createOffer()
  await peerConnection.setLocalDescription(offerDescription)

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type
  }
  
  await callDoc.set({offer})
  
  // listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if(!peerConnection.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer)
      peerConnection.setRemoteDescription(answerDescription)
    }
  })

  // when answered, add candidate to peerConnection
  answerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if(change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data())
        peerConnection.addIceCandidate(candidate)
      }
    })
  })
  hangupButton.disabled = false;
}

  // 3. Answer the call with the unique ID
  answerButton.onclick = async () => {
    const callId = callInput.value;
    const callDoc = firestore.collection('calls').doc(callId);
    const answerCandidates = callDoc.collection('answerCandidates');
    const offerCandidates = callDoc.collection('offerCandidates');

    peerConnection.onicecandidate = event => {
      event.candidate && answerCandidates.add(event.candidate.toJSON());
    }

    const callData = (await callDoc.get()).data();

    const offerDescription = callData.offer;

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription))

    const answerDescription = await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(answerDescription)

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    }

    await callDoc.update({answer});

    offerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        console.log(change);
        if (change.type === 'added') {
          let data = change.doc.data();
          peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  }



