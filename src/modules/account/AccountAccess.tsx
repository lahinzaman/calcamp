import { useState } from 'react';
import { Modal, ScrollView } from 'react-native';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action } from '../../components/FormControls';
import { DeleteAccountModal } from './DeleteAccountModal';
import { signOutWithDeviceCleanup } from '../notifications/logout';
/** Account controls stay reachable from Today while Settings remains status-only. */
export function AccountAccess() {
  const [open,setOpen]=useState(false); const [deleting,setDeleting]=useState(false); const [error,setError]=useState(false);
  return <><Action secondary label="Account" onPress={()=>setOpen(true)}/>
    {open&&<Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={()=>setOpen(false)}><SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{padding:24}}><Text className="mb-6 text-3xl font-bold">Your account</Text><Action label="Sign out" onPress={()=>{void signOutWithDeviceCleanup().catch(()=>setError(true));}}/><Action secondary label="Delete account" onPress={()=>{setOpen(false);setDeleting(true);}}/>{error&&<Text>Sign-out could not finish. Try again when connected.</Text>}<Action secondary label="Close account" onPress={()=>setOpen(false)}/></ScrollView></SafeAreaView></Modal>}
    {deleting&&<DeleteAccountModal onClose={()=>setDeleting(false)}/>}
  </>;
}
