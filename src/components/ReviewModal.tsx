import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Linking,
  Platform,
} from 'react-native';
import { markReviewOpened, dismissReviewPrompt } from '../storage/reviewStorage';

// TODO: Replace placeholder with real App Store ID after publishing to the App Store
const IOS_STORE_URL = 'itms-apps://itunes.apple.com/app/id[APP_STORE_ID]?action=write-review';
const ANDROID_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.jtysonwilliams.freeworkouttimer&showAllReviews=true';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export default function ReviewModal({ visible, onDismiss }: Props) {
  const isDark = useColorScheme() === 'dark';
  const s = makeStyles(isDark);

  const handleReview = async () => {
    await markReviewOpened();
    const url = Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL;
    await Linking.openURL(url).catch(() => {});
    onDismiss();
  };

  const handleDismiss = async () => {
    await dismissReviewPrompt();
    onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>Enjoying Free Workout Timer?</Text>
          <Text style={s.body}>
            A quick rating helps more people find this free, ad-free app — and keeps it going.
          </Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={handleReview}
            accessibilityRole="button"
            accessibilityLabel="Leave a review on the app store"
          >
            <Text style={s.primaryBtnText}>Leave a Review</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            hitSlop={8}
          >
            <Text style={s.secondaryBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(isDark: boolean) {
  const cardBg = isDark ? '#1E1E1E' : '#FFFFFF';
  const text = isDark ? '#FFFFFF' : '#111111';
  const sub = isDark ? '#888888' : '#6B6B6B';

  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    card: {
      width: '100%',
      backgroundColor: cardBg,
      borderRadius: 20,
      padding: 28,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 10,
    },
    title: {
      fontSize: 19,
      fontWeight: '700',
      color: text,
      textAlign: 'center',
      marginBottom: 10,
    },
    body: {
      fontSize: 14,
      color: sub,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    primaryBtn: {
      backgroundColor: '#22C55E',
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 32,
      width: '100%',
      alignItems: 'center',
      marginBottom: 12,
    },
    primaryBtnText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    secondaryBtn: {
      paddingVertical: 6,
    },
    secondaryBtnText: {
      fontSize: 14,
      color: sub,
    },
  });
}
