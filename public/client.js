document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const resetButton = document.getElementById('reset-button');
    const statusArea = document.getElementById('status-area');

    // O histórico começa VAZIO. A primeira mensagem do usuário será a primeira entrada.
    // A mensagem inicial do bot no HTML é apenas para exibição inicial.
    let chatHistory = [];

    // --- Funções Auxiliares ---

    function addMessage(message, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${sender}-message`);
        // Usar textContent é mais seguro e, com 'white-space: pre-wrap' no CSS, preserva quebras de linha.
        messageDiv.textContent = message;
        chatContainer.appendChild(messageDiv);
        scrollToBottom();
    }

    function addErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.classList.add('message', 'error-message');
        errorDiv.textContent = `DIO SAMA ESTÁ IRRITADO: ${message}`;
        chatContainer.appendChild(errorDiv);
        scrollToBottom();
    }

    function showTypingIndicator() {
        hideTypingIndicator(); 
        const typingDiv = document.createElement('div');
        typingDiv.classList.add('message', 'bot-message', 'typing-indicator');
        typingDiv.innerHTML = '<span></span><span></span><span></span>'; 
        typingDiv.id = 'typing-indicator'; 
        chatContainer.appendChild(typingDiv);
        scrollToBottom();
    }

    function hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function setStatus(message, isError = false) {
        statusArea.textContent = message;
        statusArea.style.color = isError ? '#c62828' : '#f0d000'; // Vermelho para erro, amarelo para normal
    }

    function clearStatus() {
        statusArea.textContent = '';
    }

    function disableInput(disabled = true) {
        messageInput.disabled = disabled;
        sendButton.disabled = disabled;
        resetButton.disabled = disabled; 
    }

    // --- Lógica Principal ---

    async function sendMessage() {
        const messageText = messageInput.value.trim();
        if (!messageText) return; 

        addMessage(messageText, 'user');
        
        messageInput.value = ''; 
        disableInput(true); 
        showTypingIndicator(); 
        setStatus('DIO está... considerando sua patética mensagem...');

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: messageText, history: chatHistory }), 
            });

            hideTypingIndicator(); 

            if (!response.ok) {
                let errorMsg = `Falha ao comunicar com meu magnífico servidor (${response.status} ${response.statusText})`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorData.message || errorMsg; 
                } catch (jsonError) {
                    console.error("Não foi possível parsear JSON de erro:", jsonError);
                }
                throw new Error(errorMsg);
            }

            const data = await response.json();

            addMessage(data.response, 'bot');
            chatHistory = data.history; 
            clearStatus();

        } catch (error) {
            console.error('Erro ao enviar/receber mensagem:', error);
            hideTypingIndicator(); 
            addErrorMessage(error.message || 'Minha conexão com este mundo inferior falhou. Tente novamente, se ousar.');
            setStatus('WRYYYYY! Erro!', true);
        } finally {
             disableInput(false); 
             messageInput.focus(); 
        }
    }

     async function resetChatHistory() {
        if (!confirm("Hmpf. Tem certeza que deseja apagar os vestígios de nossa... interação, humano?")) {
            return;
        }

        disableInput(true);
        setStatus('Obliterando o passado... MUDA MUDA MUDA!');

        try {
            const backendResponse = await fetch('/reset', { method: 'POST' });

            if (!backendResponse.ok) {
                 throw new Error(`Meu servidor se recusa a esquecer (${backendResponse.status} ${backendResponse.statusText})`);
            }

            const data = await backendResponse.json(); 
            
            chatContainer.innerHTML = ''; 
            addMessage(data.message, 'bot'); 
            
            chatHistory = []; 
            
            setStatus("Passado pulverizado. Não me aborreça à toa.");
            console.log("Histórico resetado pelo cliente.");

        } catch (error) {
            console.error("Erro ao resetar histórico:", error);
            addErrorMessage(error.message || "WRYYYYY! Falha ao tentar reescrever a história!");
            setStatus('Erro ao tentar o reset. Patético.', true);
        } finally {
             disableInput(false);
             messageInput.focus();
             setTimeout(clearStatus, 4000); 
        }
    }

    // --- Event Listeners ---
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !sendButton.disabled) {
            sendMessage();
        }
    });
    resetButton.addEventListener('click', resetChatHistory);
    
    messageInput.focus();
    scrollToBottom(); 

});