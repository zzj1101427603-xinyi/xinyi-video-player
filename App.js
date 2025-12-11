import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { Video, Audio } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

const { width } = Dimensions.get('window');

// 配置通知
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const videoRef = useRef(null);
  const [videoList, setVideoList] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeOpacity] = useState(new Animated.Value(1));
  const [welcomeScale] = useState(new Animated.Value(0.8));
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

  // 欢迎标语动画
  useEffect(() => {
    Animated.parallel([
      Animated.timing(welcomeOpacity, {
        toValue: 1,
        duration: 1000,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
      Animated.spring(welcomeScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
    
    const timer = setTimeout(() => {
      Animated.timing(welcomeOpacity, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => setShowWelcome(false));
    }, 3000);
    
    return () => clearTimeout(timer);
  }, []);

  // 配置音频会话以支持后台播放
  useEffect(() => {
    async function setupAudio() {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true, // 关键：允许后台播放
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      // 请求通知权限
      if (Platform.OS === 'android') {
        await Notifications.requestPermissionsAsync();
      }
    }
    setupAudio();
  }, []);

  // 加载本地视频
  useEffect(() => {
    loadLocalVideos();
  }, []);

  const loadLocalVideos = async () => {
    if (!permissionResponse || permissionResponse.status !== 'granted') {
      const { status } = await requestPermission();
      if (status !== 'granted') {
        Alert.alert('权限被拒绝', '需要访问媒体文件权限来加载视频');
        return;
      }
    }

    try {
      setIsLoading(true);
      const media = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.video,
        first: 50,
      });
      
      setVideoList(media.assets);
      
      // 如果有视频，默认播放第一个
      if (media.assets.length > 0 && !currentVideo) {
        playVideo(media.assets[0]);
      }
    } catch (error) {
      console.error('加载视频失败:', error);
      Alert.alert('加载失败', '无法加载本地视频，请检查权限设置');
    } finally {
      setIsLoading(false);
    }
  };

  const playVideo = async (video) => {
    setIsLoading(true);
    
    // 停止当前播放
    if (videoRef.current) {
      await videoRef.current.unloadAsync();
    }

    setCurrentVideo(video);
    setIsPlaying(true);
    setIsLoading(false);
    
    // 发送播放通知
    await sendNotification(`正在播放: ${video.filename || '视频'}`);
  };

  const togglePlayPause = async () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
    setIsPlaying(!isPlaying);
  };

  const handlePlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);
      setIsPlaying(status.isPlaying);
      
      if (status.didJustFinish) {
        // 播放结束，自动播放下一个
        playNextVideo();
      }
    }
  };

  const playNextVideo = () => {
    if (videoList.length > 0 && currentVideo) {
      const currentIndex = videoList.findIndex(v => v.id === currentVideo.id);
      const nextIndex = (currentIndex + 1) % videoList.length;
      playVideo(videoList[nextIndex]);
    }
  };

  const playPreviousVideo = () => {
    if (videoList.length > 0 && currentVideo) {
      const currentIndex = videoList.findIndex(v => v.id === currentVideo.id);
      const prevIndex = (currentIndex - 1 + videoList.length) % videoList.length;
      playVideo(videoList[prevIndex]);
    }
  };

  const seekVideo = async (seconds) => {
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(
        Math.max(0, Math.min(position + seconds * 1000, duration))
      );
    }
  };

  const formatTime = (millis) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const changePlaybackRate = () => {
    const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const newRate = rates[nextIndex];
    setPlaybackRate(newRate);
    if (videoRef.current) {
      videoRef.current.setRateAsync(newRate, true);
    }
  };

  const toggleVolume = () => {
    const newVolume = volume === 1.0 ? 0.0 : 1.0;
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.setVolumeAsync(newVolume);
    }
  };

  const sendNotification = async (message) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '馨逸超可爱',
        body: message,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
  };

  const renderVideoItem = (video) => (
    <TouchableOpacity
      key={video.id}
      style={[
        styles.videoItem,
        currentVideo && currentVideo.id === video.id && styles.selectedVideoItem,
      ]}
      onPress={() => playVideo(video)}
    >
      <Ionicons name="videocam" size={24} color="#666" />
      <Text style={styles.videoTitle} numberOfLines={2}>
        {video.filename || video.uri.split('/').pop()}
      </Text>
      {currentVideo && currentVideo.id === video.id && (
        <Ionicons name="play-circle" size={20} color="#FF6B8B" />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#FF6B8B" />
      
      /* 欢迎标语模态框 */
      <Modal
        visible={showWelcome}
        transparent={true}
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.welcomeOverlay}>
          <Animated.View style={[
            styles.welcomeContainer,
            {
              opacity: welcomeOpacity,
              transform: [{ scale: welcomeScale }],
            }
          ]}>
            <Text style={styles.welcomeTitle}>馨逸超可爱</Text>
            <Text style={styles.welcomeMessage}>为了馨逸，加倍努力！</Text>
            <View style={styles.heartContainer}>
              <Ionicons name="heart" size={50} color="#FF6B8B" />
              <Ionicons name="heart" size={40} color="#FF8E9E" style={styles.heart2} />
              <Ionicons name="heart" size={30} color="#FFB6C1" style={styles.heart3} />
            </View>
            <Text style={styles.welcomeHint}>视频后台播放器启动中...</Text>
          </Animated.View>
        </View>
      </Modal>

      /* 标题栏 */
      <View style={styles.header}>
        <Text style={styles.title}>馨逸超可爱</Text>
        <Text style={styles.subtitle}>为了馨逸，加倍努力！</Text>
      </View>

      /* 当前播放区域 */
      <View style={styles.playerContainer}>
        {currentVideo ? (
          <>
            <Video
              ref={videoRef}
              style={styles.video}
              source={{ uri: currentVideo.uri }}
              useNativeControls={false}
              resizeMode="contain"
              isLooping={false}
              onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              shouldPlay={isPlaying}
              rate={playbackRate}
              volume={volume}
              isMuted={false}
            />
            
            <View style={styles.videoInfo}>
              <Text style={styles.videoName} numberOfLines={1}>
                {currentVideo.filename || currentVideo.uri.split('/').pop()}
              </Text>
              <Text style={styles.timeText}>
                {formatTime(position)} / {formatTime(duration)}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="videocam-outline" size={60} color="#999" />
            <Text style={styles.placeholderText}>请选择视频开始播放</Text>
            <Text style={styles.placeholderSubtext}>支持后台播放，适合听课学习</Text>
          </View>
        )}

        /* 播放控制 */
        <View style={styles.controls}>
          <TouchableOpacity onPress={playPreviousVideo} style={styles.controlButton}>
            <Ionicons name="play-skip-back" size={30} color="#333" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => seekVideo(-10)} style={styles.controlButton}>
            <Ionicons name="play-back" size={30} color="#333" />
            <Text style={styles.seekText}>-10s</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
            <Ionicons 
              name={isPlaying ? "pause-circle" : "play-circle"} 
              size={70} 
              color="#FF6B8B" 
            />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => seekVideo(10)} style={styles.controlButton}>
            <Ionicons name="play-forward" size={30} color="#333" />
            <Text style={styles.seekText}>+10s</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={playNextVideo} style={styles.controlButton}>
            <Ionicons name="play-skip-forward" size={30} color="#333" />
          </TouchableOpacity>
        </View>

        /* 二级控制 */
        <View style={styles.secondaryControls}>
          <TouchableOpacity onPress={changePlaybackRate} style={styles.secondaryButton}>
            <Text style={styles.rateText}>{playbackRate}x</Text>
            <Text style={styles.buttonLabel}>倍速</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={toggleVolume} style={styles.secondaryButton}>
            <Ionicons 
              name={volume === 1.0 ? "volume-high" : "volume-mute"} 
              size={28} 
              color="#333" 
            />
            <Text style={styles.buttonLabel}>音量</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={loadLocalVideos} 
            style={styles.secondaryButton}
            disabled={isLoading}
          >
            <Ionicons name="refresh" size={28} color="#333" />
            <Text style={styles.buttonLabel}>刷新</Text>
          </TouchableOpacity>
        </View>
      </View>

      /* 视频列表 */
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>本地视频 ({videoList.length})</Text>
          <TouchableOpacity onPress={loadLocalVideos} style={styles.refreshButton}>
            <Ionicons name="refresh-circle" size={24} color="#FF6B8B" />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.videoList}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="sync" size={30} color="#FF6B8B" style={styles.spinningIcon} />
              <Text style={styles.loadingText}>加载视频中...</Text>
            </View>
          ) : videoList.length > 0 ? (
            videoList.map(renderVideoItem)
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open" size={50} color="#999" />
              <Text style={styles.emptyText}>未找到本地视频</Text>
              <Text style={styles.emptySubtext}>
                请将视频文件放入设备的视频文件夹
              </Text>
              <TouchableOpacity onPress={loadLocalVideos} style={styles.retryButton}>
                <Text style={styles.retryText}>重新扫描</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>

      /* 后台播放提示 */
      <View style={styles.footer}>
        <Ionicons name="information-circle" size={16} color="#666" />
        <Text style={styles.footerText}>
          提示：支持后台播放，锁屏或切换到其他应用时仍可听课
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  welcomeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(255, 107, 139, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: 'white',
    borderRadius: 30,
    margin: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  welcomeTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FF6B8B',
    marginBottom: 10,
    textAlign: 'center',
  },
  welcomeMessage: {
    fontSize: 20,
    color: '#333',
    marginBottom: 30,
    textAlign: 'center',
    fontWeight: '500',
  },
  heartContainer: {
    flexDirection: 'row',
    marginVertical: 20,
    position: 'relative',
    height: 60,
  },
  heart2: {
    position: 'absolute',
    left: 35,
    top: 5,
  },
  heart3: {
    position: 'absolute',
    left: 65,
    top: 15,
  },
  welcomeHint: {
    fontSize: 14,
    color: '#666',
    marginTop: 20,
    textAlign: 'center',
  },
  header: {
    backgroundColor: '#FF6B8B',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 5,
  },
  playerContainer: {
    backgroundColor: 'white',
    margin: 15,
    borderRadius: 15,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  video: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
    borderRadius: 10,
  },
  videoInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 5,
  },
  videoName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    marginRight: 10,
  },
  timeText: {
    fontSize: 14,
    color: '#666',
  },
  placeholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
  },
  placeholderText: {
    fontSize: 18,
    color: '#666',
    marginTop: 10,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  controlButton: {
    alignItems: 'center',
    padding: 10,
  },
  playButton: {
    padding: 5,
  },
  seekText: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  secondaryControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 15,
  },
  secondaryButton: {
    alignItems: 'center',
    padding: 10,
    minWidth: 80,
  },
  rateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  buttonLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 3,
  },
  listContainer: {
    flex: 1,
    marginHorizontal: 15,
    marginBottom: 15,
    backgroundColor: 'white',
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  refreshButton: {
    padding: 5,
  },
  videoList: {
    flex: 1,
  },
  videoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectedVideoItem: {
    backgroundColor: '#FFF0F5',
  },
  videoTitle: {
    flex: 1,
    marginLeft: 15,
    fontSize: 14,
    color: '#333',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  spinningIcon: {
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 15,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#FF6B8B',
    borderRadius: 20,
  },
  retryText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 5,
    textAlign: 'center',
    flex: 1,
  },
});
