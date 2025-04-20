import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('こんにちは！チャットアプリのテストを始めるよ！');
console.log('何か入力してね。終わるときは "exit" って入力してね！');

rl.on('line', (input: string) => {
  if (input.toLowerCase() === 'exit') {
    console.log('バイバイ！またね！');
    rl.close();
  } else {
    console.log(`あなたが入力したのは: ${input}`);
    console.log('他に何か入力してね！');
  }
}); 