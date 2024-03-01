'use client'
import Image from 'next/image'
import {Button} from '@nextui-org/button';
import {Input} from "@nextui-org/react";

export default function Home() {
  return (
    <main className="min-h-screen min-w-screen">
      <div className="flex flex-col justify-center min-w-screen min-h-screen"> {/* Main Div*/}

        <div className="flex flex-col max-sm:mx-20 lg:mx-[35%] border-2 border-white p-4"> {/*Login Prompt Container*/}

          <div className="text-4xl mb-10"> {/*Login Title*/}
            <h1>Login</h1>
          </div>

          <div className="flex flex-col gap-y-[10px]"> {/*Login Input*/}
              <Input
                type="email"
                color="default"
                label="Email"
                placeholder="Enter your email"
                className="max-w-[55%]"
              />
              <Input
                type="email"
                color="default"
                label="Email"
                placeholder="Enter your email"
                className="max-w-[55%]"
              />
          </div>

          <div className=""> {/*Login Prompt*/}
            <p>Hello, would you liek to login?</p>
          </div>

        </div>

      </div>
    </main>
  )
}
