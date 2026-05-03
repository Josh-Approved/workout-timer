import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { markReviewOpened, dismissReviewPrompt } from '../storage/reviewStorage';
import {
  useTheme,
  fontFamily,
  space,
  radius,
  type as t,
  hairline,
  Colors,
} from '../theme';

const IOS_STORE_URL = 'itms-apps://itunes.apple.com/app/id[APP_STORE_ID]?action=write-review';
const ANDROID_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.jtysonwilliams.freeworkouttimer&showAllReviews=true';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export default function ReviewModal({ visible, onDismiss }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);

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
          <Text style={s.title}>Enjoying Free workout timer?</Text>
          <Text style={s.body}>
            A quick rating helps more people find this free, ad-free app.
          </Text>
          <Pressable
            style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}
            onPress={handleReview}
            accessibilityRole="button"
            accessibilityLabel="Leave a review on the app store"
          >
            <Text style={s.primaryBtnText}>Leave a review</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            hitSlop={8}
          >
            <Text style={s.secondaryBtnText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: c.bgScrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: space.s7,
    },
    card: {
      width: '100%',
      backgroundColor: c.bgElevated,
      borderRadius: radius.lg,
      borderWidth: hairline,
      borderColor: c.hairline,
      padding: space.s7,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 10,
    },
    title: {
      ...t.md,
      fontFamily: fontFamily.sansSemibold,
      color: c.fg,
      textAlign: 'center',
      marginBottom: space.s3,
    },
    body: {
      ...t.sm,
      fontFamily: fontFamily.sans,
      color: c.fgMuted,
      textAlign: 'center',
      marginBottom: space.s6,
    },
    primaryBtn: {
      backgroundColor: c.inkButton,
      borderRadius: radius.md,
      paddingVertical: space.s4,
      paddingHorizontal: space.s7,
      width: '100%',
      alignItems: 'center',
      marginBottom: space.s3,
    },
    primaryBtnText: {
      ...t.base,
      fontFamily: fontFamily.sansSemibold,
      color: c.inkButtonText,
    },
    secondaryBtn: { paddingVertical: space.s2 },
    secondaryBtnText: {
      ...t.sm,
      fontFamily: fontFamily.sans,
      color: c.fgMuted,
    },
    pressed: { opacity: 0.7 },
  });
}
